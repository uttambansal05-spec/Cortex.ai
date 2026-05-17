"""Cross-source entity linker.

After code and doc sources are extracted and synthesized independently,
this module identifies relationships between them. This is the step
that makes Cortex's Brain understand WHY code was built, not just WHAT
exists.

Architecture:
  Code entities (from GitHub)  -+
                                +---> Linker LLM call ---> cross-source edges
  Doc entities (from uploads)  -+

The linker does NOT merge or modify existing nodes. It only creates
new edges of type: implements, described_by, measured_by, designed_for,
decided_in.
"""

import json
import uuid as _uuid
import anthropic
from core.config import settings
import structlog

log = structlog.get_logger()
_client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

CROSS_SOURCE_EDGE_TYPES = {
    "implements",      # code entity implements a requirement
    "described_by",    # code entity is described by a doc entity
    "measured_by",     # code entity's success is measured by a metric
    "designed_for",    # code entity was designed for a persona
    "decided_in",      # code entity was shaped by a decision
}

LINKER_PROMPT = """You are linking entities across two different knowledge sources for the same software product.

SOURCE A - CODE entities (extracted from source code):
{code_entities_json}

SOURCE B - DOCUMENT entities (extracted from product docs, PRDs, specs):
{doc_entities_json}

Your job: identify which code entities and document entities refer to the SAME capability, feature, or concept. Create cross-source relationship edges.

Return ONLY valid JSON with no markdown, no backticks:
{{"links": [{{"code_entity": "exact label from Source A", "doc_entity": "exact label from Source B", "relationship": "implements|described_by|measured_by|designed_for|decided_in", "confidence": "high|medium|low", "rationale": "one sentence why these are linked"}}]}}

Relationship types:
- "implements": code entity implements or fulfills a requirement/user_story
- "described_by": code entity is described or documented by a doc entity
- "measured_by": code entity's success is tracked by a metric
- "designed_for": code entity was built for a specific persona
- "decided_in": code entity's design was shaped by a decision_log

Rules:
- Only create links where a genuine conceptual relationship exists.
- Match by capability, not by name similarity alone. "OfflinePaymentHandler" implements "Offline payment support" even though names differ.
- A single code entity can link to multiple doc entities and vice versa.
- Do NOT force links. If no relationship exists, return {{"links": []}}.
- Prefer high-confidence links. Only use "low" if the connection is plausible but uncertain.
- Return valid JSON only."""


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
    return {"links": []}


def _prepare_entity_summary(nodes: list[dict], max_items: int = 80) -> str:
    """Compact representation of nodes for the linker prompt.

    We only send label, type, and a truncated summary to keep
    token usage reasonable.
    """
    items = []
    for n in nodes[:max_items]:
        items.append({
            "label": n.get("label", ""),
            "type": n.get("node_type", ""),
            "summary": (n.get("summary", "") or "")[:200],
        })
    return json.dumps(items, indent=1)


async def link_cross_source(
    code_nodes: list[dict],
    doc_nodes: list[dict],
    label_to_id: dict[str, str],
    snapshot_id: str,
    project_id: str,
) -> list[dict]:
    """Create cross-source edges between code and doc entities.

    Args:
        code_nodes: Brain nodes with domain="code"
        doc_nodes: Brain nodes with domain="product"
        label_to_id: mapping of label.lower() -> node UUID (all nodes)
        snapshot_id: current snapshot
        project_id: current project

    Returns:
        List of edge dicts ready for brain_edges insert.
    """
    if not code_nodes or not doc_nodes:
        log.info("linker.skip", reason="missing_source",
                 code=len(code_nodes), doc=len(doc_nodes))
        return []

    log.info("linker.start", code_nodes=len(code_nodes), doc_nodes=len(doc_nodes))

    code_batches = [code_nodes[i:i+80] for i in range(0, len(code_nodes), 80)]
    doc_summary = _prepare_entity_summary(doc_nodes, max_items=80)

    all_edges = []
    seen_edges = set()

    for batch_idx, code_batch in enumerate(code_batches):
        code_summary = _prepare_entity_summary(code_batch, max_items=80)

        prompt = LINKER_PROMPT.format(
            code_entities_json=code_summary,
            doc_entities_json=doc_summary,
        )

        try:
            message = _client.messages.create(
                model="claude-haiku-4-5",
                max_tokens=4096,
                timeout=60,
                messages=[{"role": "user", "content": prompt}]
            )
            result = _clean_json(message.content[0].text)
            links = result.get("links", [])

            log.info("linker.batch_result", batch=batch_idx + 1,
                     links_found=len(links))

            for link in links:
                if not isinstance(link, dict):
                    continue

                code_label = link.get("code_entity", "").lower().strip()
                doc_label = link.get("doc_entity", "").lower().strip()
                relationship = link.get("relationship", "described_by")
                confidence = link.get("confidence", "medium")

                if relationship not in CROSS_SOURCE_EDGE_TYPES:
                    relationship = "described_by"

                code_id = label_to_id.get(code_label)
                doc_id = label_to_id.get(doc_label)

                if not code_id or not doc_id:
                    log.debug("linker.unresolved_label",
                              code_label=code_label, doc_label=doc_label)
                    continue

                edge_key = f"{code_id}:{doc_id}:{relationship}"
                if edge_key in seen_edges:
                    continue
                seen_edges.add(edge_key)

                all_edges.append({
                    "id": str(_uuid.uuid4()),
                    "snapshot_id": snapshot_id,
                    "project_id": project_id,
                    "from_node": code_id,
                    "to_node": doc_id,
                    "edge_type": relationship,
                    "weight": {"high": 1.0, "medium": 0.7, "low": 0.4}.get(confidence, 0.7),
                    "metadata": {
                        "cross_source": True,
                        "confidence": confidence,
                        "rationale": link.get("rationale", ""),
                    },
                })

        except Exception as e:
            log.warning("linker.batch_failed", batch=batch_idx + 1,
                        error=str(e)[:200])
            continue

    log.info("linker.complete", total_cross_edges=len(all_edges))
    return all_edges
