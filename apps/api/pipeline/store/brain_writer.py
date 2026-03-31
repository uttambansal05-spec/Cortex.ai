import json
import hashlib
import uuid
import anthropic
from core.config import settings
from core.database import get_supabase
import structlog

log = structlog.get_logger()

_client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

NODE_TYPE_MAP = {
    "entities":     "entity",
    "decisions":    "decision",
    "risks":        "risk",
    "gaps":         "gap",
    "dependencies": "dependency",
    "user_flows":   "flow",
    "apis":         "api",
    "data_models":  "model",
}


def _fingerprint(node_type: str, label: str, project_id: str) -> str:
    """Stable fingerprint for dedup across rebuilds."""
    key = f"{project_id}:{node_type}:{label.lower().strip()}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def _get_embedding_text(node_type: str, item: dict) -> str:
    """Build the text to embed for semantic search."""
    parts = [item.get("label", "")]
    if "summary" in item:
        parts.append(item["summary"])
    if "detail" in item:
        parts.append(item["detail"])
    if "rationale" in item:
        parts.append(item["rationale"])
    return " | ".join(p for p in parts if p)


def _get_embedding(text: str) -> list[float] | None:
    """Get embedding via Voyage AI through Anthropic SDK or fallback."""
    # Note: In production, use voyage-3-lite for embeddings.
    # For now, return None and skip pgvector (semantic search degrades to keyword)
    # Implement when Voyage API access is confirmed.
    return None


def _extract_nodes(graph: dict, project_id: str, snapshot_id: str) -> list[dict]:
    """Flatten graph into insertable node rows."""
    rows = []

    for graph_key, node_type in NODE_TYPE_MAP.items():
        for item in graph.get(graph_key, []):
            label = item.get("label") or item.get("from_entity", "")
            if not label:
                continue

            summary = (
                item.get("summary") or
                item.get("detail") or
                item.get("rationale") or
                f"{item.get('from_entity')} → {item.get('to_entity')}"  # for dependencies
            )

            source_files = item.get("source_files") or []
            source_file = source_files[0] if source_files else item.get("source_file")

            rows.append({
                "id": str(uuid.uuid4()),
                "snapshot_id": snapshot_id,
                "project_id": project_id,
                "node_type": node_type,
                "label": label[:500],
                "summary": (summary or "")[:2000],
                "metadata": {k: v for k, v in item.items()
                             if k not in ("label", "summary", "detail", "rationale")},
                "source_file": source_file,
                "source_pr": None,
                "fingerprint": _fingerprint(node_type, label, project_id),
            })

    return rows


async def write_brain(
    graph: dict,
    project_id: str,
    snapshot_id: str,
) -> dict:
    """Persist synthesised graph to Supabase."""
    db = get_supabase()

    # Update snapshot to building
    db.table("brain_snapshots").update({
        "status": "building",
    }).eq("id", snapshot_id).execute()

    nodes = _extract_nodes(graph, project_id, snapshot_id)
    log.info("brain_writer.writing_nodes", count=len(nodes), snapshot_id=snapshot_id)

    # Batch insert nodes (100 at a time)
    batch_size = 100
    for i in range(0, len(nodes), batch_size):
        batch = nodes[i:i + batch_size]
        db.table("brain_nodes").upsert(
            batch,
            on_conflict="fingerprint",
        ).execute()

    # Build metadata summary
    by_type: dict[str, int] = {}
    for node in nodes:
        t = node["node_type"]
        by_type[t] = by_type.get(t, 0) + 1

    product_summary = graph.get("product_summary", {})
    metadata = {
        "total_nodes": len(nodes),
        "by_type": by_type,
        "product_summary": product_summary,
        "files_ingested": product_summary.get("total_apis", 0),
    }

    # Mark snapshot complete
    from datetime import datetime, timezone
    db.table("brain_snapshots").update({
        "status": "complete",
        "built_at": datetime.now(timezone.utc).isoformat(),
        "staleness_score": 0.0,
        "metadata": metadata,
    }).eq("id", snapshot_id).execute()

    log.info("brain_writer.complete",
             snapshot_id=snapshot_id,
             total_nodes=len(nodes),
             by_type=by_type)

    return metadata
