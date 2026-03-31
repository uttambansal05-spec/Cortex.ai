import json
import anthropic
from core.config import settings
import structlog

log = structlog.get_logger()

_client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

SYNTHESISE_PROMPT = """You are building the knowledge graph for a product's "Product Brain" — a structured memory of everything the product team needs to know.

You have received extracted knowledge from {total_chunks} code chunks across {total_files} files.

Raw extractions (JSON):
{extractions_json}

Your job: Synthesise this into a unified knowledge graph. Merge duplicates, resolve cross-chunk references, and identify higher-order patterns.

Return ONLY valid JSON with this structure:
{{
  "entities": [
    {{
      "label": "Unique entity name",
      "type": "class|function|service|module|api_endpoint|data_model|config|util",
      "summary": "What it does",
      "dependencies": ["other entities"],
      "source_files": ["path/to/file.py"],
      "is_critical_path": true
    }}
  ],
  "decisions": [
    {{
      "label": "Decision title",
      "rationale": "Why",
      "source_files": ["file.py"],
      "confidence": "high|medium|low"
    }}
  ],
  "risks": [
    {{
      "label": "Risk",
      "severity": "high|medium|low",
      "detail": "Detail",
      "affected_entities": ["EntityName"],
      "source_files": ["file.py"]
    }}
  ],
  "gaps": [
    {{
      "label": "Gap",
      "detail": "What's missing",
      "affected_areas": ["module or feature area"]
    }}
  ],
  "dependencies": [
    {{
      "from_entity": "EntityA",
      "to_entity": "EntityB",
      "type": "imports|calls|extends|uses|triggers",
      "is_external": false
    }}
  ],
  "user_flows": [
    {{
      "label": "Flow name",
      "steps": ["step1", "step2"],
      "entities_involved": ["Entity1", "Entity2"],
      "critical_path": true
    }}
  ],
  "product_summary": {{
    "what_it_does": "2-3 sentence product description derived from code",
    "core_modules": ["module1", "module2"],
    "primary_data_model": "describe the main data model",
    "critical_paths": ["checkout flow", "auth flow"],
    "tech_stack": ["react", "fastapi"],
    "total_entities": 0,
    "total_apis": 0,
    "architecture_pattern": "monolith|microservices|serverless|hybrid"
  }}
}}

Rules:
- Merge entities that appear in multiple files into one canonical entry
- source_files should list ALL files where the entity appears
- Cross-file dependencies are the most important to capture
- Gaps should surface missing error handlers, undocumented edge cases, missing tests
- Risks should call out single points of failure, no auth checks, unsafe operations
- is_critical_path = true for entities that appear in user-facing flows or payment/auth paths"""


async def synthesise_extractions(extractions: list[dict]) -> dict:
    """Merge all chunk extractions into unified knowledge graph via Claude."""

    # Pre-aggregate to reduce token count
    aggregated = _pre_aggregate(extractions)
    extractions_json = json.dumps(aggregated, indent=2)

    total_chars = len(extractions_json)
    log.info("claude.synthesise.start",
             chunks=len(extractions),
             chars=total_chars)

    # If too large, batch synthesise
    MAX_CHARS = 150_000  # Claude's effective context for this task
    if total_chars > MAX_CHARS:
        return await _batch_synthesise(aggregated)

    message = _client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=8192,
        messages=[{
            "role": "user",
            "content": SYNTHESISE_PROMPT.format(
                total_chunks=len(extractions),
                total_files=len({e.get("_source", {}).get("file_path") for e in extractions}),
                extractions_json=extractions_json,
            )
        }]
    )

    text = message.content[0].text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    result = json.loads(text)
    log.info("claude.synthesise.complete",
             entities=len(result.get("entities", [])),
             risks=len(result.get("risks", [])),
             gaps=len(result.get("gaps", [])))
    return result


def _pre_aggregate(extractions: list[dict]) -> dict:
    """Pre-aggregate extractions by type to reduce token count before sending to Claude."""
    aggregated: dict = {
        "by_file": {},
        "total_chunks": len(extractions),
    }

    for extraction in extractions:
        source = extraction.get("_source", {})
        file_path = source.get("file_path", "unknown")

        if file_path not in aggregated["by_file"]:
            aggregated["by_file"][file_path] = {
                "entities": [],
                "decisions": [],
                "risks": [],
                "gaps": [],
                "apis": [],
                "data_models": [],
                "module_summary": "",
            }

        file_data = aggregated["by_file"][file_path]
        for key in ["entities", "decisions", "risks", "gaps", "apis", "data_models"]:
            file_data[key].extend(extraction.get(key, []))
        if extraction.get("module_summary"):
            file_data["module_summary"] = extraction["module_summary"]

    return aggregated


async def _batch_synthesise(aggregated: dict) -> dict:
    """
    For very large repos: synthesise in batches then merge.
    Splits by file groups, synthesises each, then merges results.
    """
    files = list(aggregated["by_file"].items())
    batch_size = 50
    batches = [dict(files[i:i+batch_size]) for i in range(0, len(files), batch_size)]
    partial_results = []

    for i, batch in enumerate(batches):
        log.info("claude.synthesise.batch", batch=i+1, total=len(batches))
        batch_payload = {"by_file": batch, "total_chunks": len(batch)}
        batch_json = json.dumps(batch_payload, indent=2)

        message = _client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=8192,
            messages=[{
                "role": "user",
                "content": SYNTHESISE_PROMPT.format(
                    total_chunks=len(batch),
                    total_files=len(batch),
                    extractions_json=batch_json,
                )
            }]
        )
        text = message.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        partial_results.append(json.loads(text))

    return _merge_partial_results(partial_results)


def _merge_partial_results(partials: list[dict]) -> dict:
    """Merge multiple partial synthesis results into one unified graph."""
    merged: dict = {
        "entities": [],
        "decisions": [],
        "risks": [],
        "gaps": [],
        "dependencies": [],
        "user_flows": [],
        "product_summary": {},
    }

    seen_labels: dict[str, set] = {k: set() for k in merged}

    for partial in partials:
        for key in ["entities", "decisions", "risks", "gaps", "dependencies", "user_flows"]:
            for item in partial.get(key, []):
                label = item.get("label", "")
                if label and label not in seen_labels[key]:
                    seen_labels[key].add(label)
                    merged[key].append(item)

    if partials:
        merged["product_summary"] = partials[-1].get("product_summary", {})

    return merged
