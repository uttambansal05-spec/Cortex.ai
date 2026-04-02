import json
import hashlib
import uuid
from core.database import get_supabase
import structlog
from datetime import datetime, timezone

log = structlog.get_logger()

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
    key = f"{project_id}:{node_type}:{label.lower().strip()}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def _extract_nodes(graph: dict, project_id: str, snapshot_id: str) -> list[dict]:
    rows = []
    seen_fingerprints = set()

    for graph_key, node_type in NODE_TYPE_MAP.items():
        items = graph.get(graph_key, [])
        log.info("brain_writer.processing_key", key=graph_key, count=len(items))

        for item in items:
            if not isinstance(item, dict):
                continue

            label = (
                item.get("label") or
                item.get("from_entity") or
                item.get("name") or ""
            )
            if not label:
                continue

            fp = _fingerprint(node_type, str(label), project_id)
            if fp in seen_fingerprints:
                continue
            seen_fingerprints.add(fp)

            summary = (
                item.get("summary") or
                item.get("detail") or
                item.get("rationale") or
                f"{item.get('from_entity', '')} → {item.get('to_entity', '')}"
            )

            source_files = item.get("source_files") or []
            source_file = source_files[0] if source_files else item.get("source_file")

            rows.append({
                "id": str(uuid.uuid4()),
                "snapshot_id": snapshot_id,
                "project_id": project_id,
                "node_type": node_type,
                "label": str(label)[:500],
                "summary": str(summary or "")[:2000],
                "metadata": {k: v for k, v in item.items()
                             if k not in ("label", "summary", "detail", "rationale")},
                "source_file": source_file,
                "source_pr": None,
                "fingerprint": fp,
            })

    return rows


async def write_brain(graph: dict, project_id: str, snapshot_id: str) -> dict:
    db = get_supabase()

    db.table("brain_snapshots").update({
        "status": "building",
    }).eq("id", snapshot_id).execute()

    log.info("brain_writer.graph_received",
             entity_count=len(graph.get("entities", [])),
             risk_count=len(graph.get("risks", [])),
             gap_count=len(graph.get("gaps", [])))

    nodes = _extract_nodes(graph, project_id, snapshot_id)
    log.info("brain_writer.writing_nodes", count=len(nodes), snapshot_id=snapshot_id)

    batch_size = 50
    for i in range(0, len(nodes), batch_size):
        batch = nodes[i:i + batch_size]
        db.table("brain_nodes").insert(batch).execute()

    by_type: dict[str, int] = {}
    for node in nodes:
        t = node["node_type"]
        by_type[t] = by_type.get(t, 0) + 1

    product_summary = graph.get("product_summary", {})
    metadata = {
        "total_nodes": len(nodes),
        "by_type": by_type,
        "product_summary": product_summary,
    }

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
