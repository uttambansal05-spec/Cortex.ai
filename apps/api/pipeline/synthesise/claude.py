import json
import anthropic
from core.config import settings
import structlog

log = structlog.get_logger()

_client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

SYNTHESISE_PROMPT = """You are building a knowledge graph for a Product Brain.

You have extracted knowledge from {total_chunks} code chunks across {total_files} files.

Raw extractions (JSON):
{extractions_json}

Synthesise into a unified knowledge graph. Return ONLY valid JSON:
{{
  "entities": [{{"label": "Name", "type": "class|function|service|module|api_endpoint|data_model|config|util", "summary": "What it does", "dependencies": [], "source_files": [], "is_critical_path": false}}],
  "decisions": [{{"label": "Decision", "rationale": "Why", "source_files": [], "confidence": "high|medium|low"}}],
  "risks": [{{"label": "Risk", "severity": "high|medium|low", "detail": "Detail", "affected_entities": [], "source_files": []}}],
  "gaps": [{{"label": "Gap", "detail": "What is missing", "affected_areas": []}}],
  "dependencies": [{{"from_entity": "A", "to_entity": "B", "type": "imports|calls|extends|uses", "is_external": false}}],
  "user_flows": [{{"label": "Flow", "steps": [], "entities_involved": [], "critical_path": false}}],
  "product_summary": {{
    "what_it_does": "2-3 sentence description",
    "core_modules": [],
    "primary_data_model": "",
    "critical_paths": [],
    "tech_stack": [],
    "total_entities": 0,
    "total_apis": 0,
    "architecture_pattern": "monolith|microservices|serverless|hybrid"
  }}
}}

Rules: Merge duplicates. Empty arrays are fine. MUST return complete valid JSON."""


def _clean_json(text: str) -> str:
    """Try to extract valid JSON from potentially truncated response."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    
    # Try parsing as-is first
    try:
        json.loads(text)
        return text
    except json.JSONDecodeError:
        pass
    
    # Try to find the JSON object
    start = text.find('{')
    if start == -1:
        return '{}'
    
    # Try progressively shorter strings to find valid JSON
    end = len(text)
    while end > start:
        try:
            json.loads(text[start:end])
            return text[start:end]
        except json.JSONDecodeError:
            end -= 1
    
    return '{}'


def _empty_graph() -> dict:
    return {
        "entities": [], "decisions": [], "risks": [], "gaps": [],
        "dependencies": [], "user_flows": [],
        "product_summary": {
            "what_it_does": "Analysis incomplete due to API limits.",
            "core_modules": [], "primary_data_model": "",
            "critical_paths": [], "tech_stack": [],
            "total_entities": 0, "total_apis": 0,
            "architecture_pattern": "unknown"
        }
    }


async def synthesise_extractions(extractions: list[dict]) -> dict:
    aggregated = _pre_aggregate(extractions)
    extractions_json = json.dumps(aggregated, indent=2)
    total_chars = len(extractions_json)

    log.info("claude.synthesise.start", chunks=len(extractions), chars=total_chars)

    MAX_CHARS = 150_000
    if total_chars > MAX_CHARS:
        return await _batch_synthesise(aggregated)

    try:
        message = _client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=8192,
            messages=[{
                "role": "user",
                "content": SYNTHESISE_PROMPT.format(
                    total_chunks=len(extractions),
                    total_files=len(aggregated.get("by_file", {})),
                    extractions_json=extractions_json,
                )
            }]
        )
        text = message.content[0].text
        clean = _clean_json(text)
        result = json.loads(clean)
        log.info("claude.synthesise.complete",
                 entities=len(result.get("entities", [])),
                 risks=len(result.get("risks", [])))
        return result
    except Exception as e:
        log.error("claude.synthesise.failed", error=str(e))
        return _empty_graph()


def _pre_aggregate(extractions: list[dict]) -> dict:
    aggregated: dict = {"by_file": {}, "total_chunks": len(extractions)}
    for extraction in extractions:
        source = extraction.get("_source", {})
        file_path = source.get("file_path", "unknown")
        if file_path not in aggregated["by_file"]:
            aggregated["by_file"][file_path] = {
                "entities": [], "decisions": [], "risks": [],
                "gaps": [], "apis": [], "data_models": [], "module_summary": "",
            }
        file_data = aggregated["by_file"][file_path]
        for key in ["entities", "decisions", "risks", "gaps", "apis", "data_models"]:
            file_data[key].extend(extraction.get(key, []))
        if extraction.get("module_summary"):
            file_data["module_summary"] = extraction["module_summary"]
    return aggregated


async def _batch_synthesise(aggregated: dict) -> dict:
    files = list(aggregated["by_file"].items())
    batch_size = 30
    batches = [dict(files[i:i+batch_size]) for i in range(0, len(files), batch_size)]
    partial_results = []

    for i, batch in enumerate(batches):
        log.info("claude.synthesise.batch", batch=i+1, total=len(batches))
        batch_payload = {"by_file": batch, "total_chunks": len(batch)}
        batch_json = json.dumps(batch_payload, indent=2)

        try:
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
            text = message.content[0].text
            clean = _clean_json(text)
            partial_results.append(json.loads(clean))
        except Exception as e:
            log.error("claude.synthesise.batch_failed", batch=i+1, error=str(e))
            partial_results.append(_empty_graph())

    return _merge_partial_results(partial_results)


def _merge_partial_results(partials: list[dict]) -> dict:
    merged: dict = {
        "entities": [], "decisions": [], "risks": [],
        "gaps": [], "dependencies": [], "user_flows": [],
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
