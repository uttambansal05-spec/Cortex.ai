import json
import anthropic
from core.config import settings
import structlog

log = structlog.get_logger()
_client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

SYNTHESISE_PROMPT = """You are building a knowledge graph from code extractions.

Here are the extracted entities, decisions, risks and gaps from {file_count} files:

{extractions_json}

Synthesise these into a unified knowledge graph. Merge duplicates. You MUST create dependencies between entities. Every entity should link to at least one other entity, risk, or decision it is related to.

Return ONLY valid JSON:
{{"entities": [{{"label": "Name", "type": "class|function|service|module|api_endpoint|data_model|config|util", "summary": "What it does", "source_files": [], "dependencies": []}}], "decisions": [{{"label": "Decision", "rationale": "Why", "source_files": []}}], "risks": [{{"label": "Risk", "severity": "high|medium|low", "detail": "Detail", "source_files": []}}], "gaps": [{{"label": "Gap", "detail": "What is missing"}}], "dependencies": [{{"from_entity": "A", "to_entity": "B", "type": "imports|calls|extends|uses", "is_external": false}}], "user_flows": [{{"label": "Flow", "steps": [], "entities_involved": []}}], "product_summary": {{"what_it_does": "2-3 sentences", "core_modules": [], "tech_stack": [], "architecture_pattern": "monolith|microservices|serverless|hybrid"}}}}

Return every entity, risk, gap and decision. Do not skip anything."""


def _clean_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    try:
        return json.loads(text)
    except Exception:
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1:
            try:
                return json.loads(text[start:end+1])
            except Exception:
                pass
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


def _flatten_extractions(extractions: list[dict]) -> list[dict]:
    """Convert raw extractions to flat list of items with source file."""
    flat = []
    for e in extractions:
        source = e.get("_source", {})
        file_path = source.get("file_path", "unknown")
        for entity in e.get("entities", []):
            entity["source_files"] = [file_path]
            flat.append({"type": "entity", **entity})
        for decision in e.get("decisions", []):
            decision["source_files"] = [file_path]
            flat.append({"type": "decision", **decision})
        for risk in e.get("risks", []):
            risk["source_files"] = [file_path]
            flat.append({"type": "risk", **risk})
        for gap in e.get("gaps", []):
            gap["source_files"] = [file_path]
            flat.append({"type": "gap", **gap})
    return flat


async def synthesise_extractions(extractions: list[dict]) -> dict:
    flat = _flatten_extractions(extractions)
    
    log.info("claude.synthesise.start",
             total_files=len(extractions),
             total_items=len(flat))

    if not flat:
        return _empty_graph()

    # Split into batches of 50 items
    batch_size = 50
    batches = [flat[i:i+batch_size] for i in range(0, len(flat), batch_size)]
    partials = []

    total_batches = len(batches)
    for i, batch in enumerate(batches):
        log.info("claude.synthesise.batch", batch=i+1, total=total_batches)
        payload = json.dumps(batch, indent=1)

        try:
            message = _client.messages.create(
                model="claude-haiku-4-5",
                max_tokens=8192,
                timeout=90,
                messages=[{"role": "user", "content": SYNTHESISE_PROMPT.format(
                    file_count=len(set(item.get("source_files", ["?"])[0] for item in batch)),
                    extractions_json=payload
                )}]
            )
            result = _clean_json(message.content[0].text)
            log.info("claude.synthesise.batch_result",
                     batch=i+1,
                     entities=len(result.get("entities", [])),
                     risks=len(result.get("risks", [])))
            partials.append(result if result else _empty_graph())
        except Exception as e:
            log.error("claude.synthesise.batch_failed", batch=i+1, error=str(e)[:200])
            partials.append(_empty_graph())

    merged = _merge(partials)
    log.info("claude.synthesise.complete",
             entities=len(merged.get("entities", [])),
             risks=len(merged.get("risks", [])))
    return merged
