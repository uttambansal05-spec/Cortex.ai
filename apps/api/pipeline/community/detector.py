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
    node_summary = [
        {"label": n["label"], "type": n["node_type"], "summary": (n.get("summary") or "")[:80]}
        for n in nodes
    ]
    log.info("community.detect_start", node_count=len(nodes))
    try:
        message = _client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=4096,
            messages=[{"role": "user", "content": COMMUNITY_PROMPT.format(nodes_json=json.dumps(node_summary, indent=1))}]
        )
        text = message.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        result = json.loads(text)
        communities = result.get("communities", [])
        label_to_id = {n["label"].lower().strip(): n["id"] for n in nodes}
        db = get_supabase()
        rows = []
        for community in communities:
            node_ids = [
                label_to_id[l.lower().strip()]
                for l in community.get("node_labels", [])
                if l.lower().strip() in label_to_id
            ]
            if not node_ids:
                continue
            rows.append({
                "id": str(uuid.uuid4()),
                "snapshot_id": snapshot_id,
                "project_id": project_id,
                "label": community["label"],
                "summary": community.get("summary", ""),
                "node_ids": node_ids,
                "domain": community.get("domain", "code"),
                "metadata": {"node_count": len(node_ids)},
            })
        if rows:
            db.table("brain_communities").insert(rows).execute()
            log.info("community.detect_complete", communities=len(rows))
        return rows
    except Exception as e:
        log.error("community.detect_failed", error=str(e)[:200])
        return []
