import json
import anthropic
from core.config import settings
from core.database import get_supabase
import structlog
import uuid

log = structlog.get_logger()
_client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

COMMUNITY_PROMPT = """Group these knowledge graph nodes into logical feature communities.

Nodes:
{nodes_json}

Return ONLY valid JSON:
{{
  "communities": [
    {{
      "label": "Community name (e.g. Shopping Cart, Product Catalog, Authentication)",
      "summary": "2-3 sentences describing what this community covers",
      "node_labels": ["NodeLabel1", "NodeLabel2"],
      "domain": "code"
    }}
  ]
}}

Rules:
- Create 5-12 communities based on feature areas
- Every node should belong to one community
- Name communities by product feature, not technical layer"""


async def detect_communities(project_id: str, snapshot_id: str, nodes: list[dict]) -> list[dict]:
    if not nodes:
        return []

    MAX_NODES_PER_BATCH = 200
    node_summary = [
        {"label": n["label"], "type": n["node_type"], "summary": (n.get("summary") or "")[:50]}
        for n in nodes
    ]

    batches = [node_summary[i:i+MAX_NODES_PER_BATCH] for i in range(0, len(node_summary), MAX_NODES_PER_BATCH)]
    log.info("community.detect_start", node_count=len(nodes), batches=len(batches))

    label_to_id = {n["label"].lower().strip(): n["id"] for n in nodes}
    db = get_supabase()
    all_rows = []

    for batch_idx, batch in enumerate(batches):
        try:
            message = _client.messages.create(
                model="claude-haiku-4-5",
                max_tokens=8192,
                messages=[{"role": "user", "content": COMMUNITY_PROMPT.format(nodes_json=json.dumps(batch, indent=1))}]
            )
            text = message.content[0].text.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

            try:
                result = json.loads(text)
            except json.JSONDecodeError:
                start = text.find("{")
                end = text.rfind("}")
                if start != -1 and end != -1:
                    result = json.loads(text[start:end+1])
                else:
                    log.warning("community.batch_parse_failed", batch=batch_idx)
                    continue

            communities = result.get("communities", [])
            for community in communities:
                node_ids = [
                    label_to_id[l.lower().strip()]
                    for l in community.get("node_labels", [])
                    if l.lower().strip() in label_to_id
                ]
                if not node_ids:
                    continue
                all_rows.append({
                    "id": str(uuid.uuid4()),
                    "snapshot_id": snapshot_id,
                    "project_id": project_id,
                    "label": community["label"],
                    "summary": community.get("summary", ""),
                    "node_ids": node_ids,
                    "domain": community.get("domain", "code"),
                    "metadata": {"node_count": len(node_ids)},
                })
            log.info("community.batch_complete", batch=batch_idx, communities=len(communities))
        except Exception as e:
            log.error("community.batch_failed", batch=batch_idx, error=str(e)[:200])

    if all_rows:
        for i in range(0, len(all_rows), 50):
            db.table("brain_communities").insert(all_rows[i:i+50]).execute()
        log.info("community.detect_complete", communities=len(all_rows))
    return all_rows
