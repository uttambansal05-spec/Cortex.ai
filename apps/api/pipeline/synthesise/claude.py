import json
import anthropic
from core.config import settings
import structlog

log = structlog.get_logger()
_client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

SYNTHESISE_PROMPT = """Build a knowledge graph from these code extractions.

{extractions_json}

Return ONLY valid JSON:
{{
  "entities": [{{"label": "Name", "type": "class|function|service|module|api_endpoint|data_model|config|util", "summary": "What it does", "source_files": []}}],
  "decisions": [{{"label": "Decision", "rationale": "Why", "source_files": []}}],
  "risks": [{{"label": "Risk", "severity": "high|medium|low", "detail": "Detail", "source_files": []}}],
  "gaps": [{{"label": "Gap", "detail": "What is missing"}}],
  "dependencies": [{{"from_entity": "A", "to_entity": "B", "type": "imports|calls|extends|uses", "is_external": false}}],
  "user_flows": [{{"label": "Flow", "steps": [], "entities_involved": []}}],
  "product_summary": {{
    "what_it_does": "2-3 sentence description",
    "core_modules": [],
    "tech_stack": [],
    "architecture_pattern": "monolith|microservices|serverless|hybrid"
  }}
}}"""


def _clean_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    try:
        return json.loads(text)
    except Exception:
        start = text.find('{')
        if start == -1:
            return {}
        for end in range(len(text), start, -1):
            try:
                return json.loads(text[start:end])
            except Exception:
                continue
        return {}


def _empty_graph() -> dict:
    return {
        "entities": [], "decisions": [], "risks": [], "gaps": [],
        "dependencies": [], "user_flows": [],
        "product_summary": {"what_it_does": "", "core_modules": [], "tech_stack": [], "architecture_pattern": "unknown"}
    }


def _merge(partials: list[dict]) -> dict:
    merged = {"entities": [], "decisions": [], "risks": [], "gaps": [], "dependencies": [], "user_flows": [], "product_summary": {}}
    for p in partials:
        for k in ["entities", "decisions", "risks", "gaps", "dependencies", "user_flows"]:
            merged[k].extend(p.get(k, []) if isinstance(p.get(k), list) else [])
        if p.get("product_summary"):
            merged["product_summary"] = p["product_summary"]
    return merged


def _pre_aggregate(extractions: list[dict]) -> dict:
    by_file: dict = {}
    for e in extractions:
        fp = e.get("_source", {}).get("file_path", "unknown")
        if fp not in by_file:
            by_file[fp] = {"entities": [], "decisions": [], "risks": [], "gaps": [], "module_summary": ""}
        for k in ["entities", "decisions", "risks", "gaps"]:
            by_file[fp][k].extend(e.get(k, []))
        if e.get("module_summary"):
            by_file[fp]["module_summary"] = e["module_summary"]
    return by_file


async def synthesise_extractions(extractions: list[dict]) -> dict:
    by_file = _pre_aggregate(extractions)
    files = list(by_file.items())
    batch_size = 12
    batches = [dict(files[i:i+batch_size]) for i in range(0, len(files), batch_size)]
    partials = []

    log.info("claude.synthesise.start", total_files=len(files), total_batches=len(batches))

    for i, batch in enumerate(batches):
        log.info("claude.synthesise.batch", batch=i+1, total=len(batches))
        payload = json.dumps({"files": batch}, indent=1)

        if len(payload) > 80000:
            payload = json.dumps({"files": batch}, separators=(',', ':'))

        try:
            message = _client.messages.create(
                model="claude-haiku-4-5",
                max_tokens=4096,
                timeout=90,
                messages=[{"role": "user", "content": SYNTHESISE_PROMPT.format(extractions_json=payload)}]
            )
            result = _clean_json(message.content[0].text)
            partials.append(result if result else _empty_graph())
        except Exception as e:
            log.error("claude.synthesise.batch_failed", batch=i+1, error=str(e)[:200])
            partials.append(_empty_graph())

    merged = _merge(partials)
    log.info("claude.synthesise.complete",
             entities=len(merged.get("entities", [])),
             risks=len(merged.get("risks", [])))
    return merged
