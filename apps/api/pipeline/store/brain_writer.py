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
    "configs":      "config",
    # Product/doc node types (extraction writes these as entities with subtype)
    "requirements":   "requirement",
    "user_stories":   "user_story",
    "metrics":        "metric",
    "personas":       "persona",
    "decision_logs":  "decision_log",
    "processes":      "process",
}

EDGE_TYPE_MAP = {
    "imports": "imports", "calls": "calls", "extends": "extends",
    "uses": "uses", "triggers": "triggers", "depends_on": "depends_on",
}


def _fingerprint(node_type: str, label: str, project_id: str) -> str:
    key = f"{project_id}:{node_type}:{label.lower().strip()}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


# Product entity subtypes - when extraction writes entities with product types
PRODUCT_ENTITY_TYPES = {
    "requirement", "user_story", "metric", "persona", "decision_log", "process",
}


def _extract_nodes(graph: dict, project_id: str, snapshot_id: str) -> list[dict]:
    rows = []
    seen = set()
    for graph_key, node_type in NODE_TYPE_MAP.items():
        for item in graph.get(graph_key, []):
            if not isinstance(item, dict):
                continue
            label = item.get("label") or item.get("from_entity") or ""
            if not label:
                continue

            # For entities, check if the item's "type" field is a product subtype
            resolved_type = node_type
            if graph_key == "entities":
                item_type = item.get("type", "")
                if item_type in PRODUCT_ENTITY_TYPES:
                    resolved_type = item_type

            fp = _fingerprint(resolved_type, str(label), project_id)
            if fp in seen:
                continue
            seen.add(fp)
            summary = (
                item.get("summary") or item.get("detail") or item.get("rationale") or
                f"{item.get('from_entity', '')} -> {item.get('to_entity', '')}"
            )
            source_files = item.get("source_files") or []
            source_file = source_files[0] if source_files else item.get("source_file")

            # Determine source_type and domain from file path
            sf = source_file or ""
            if sf.startswith("upload://"):
                src_type = "upload"
                domain = "product"
            elif sf.startswith("notion://"):
                src_type = "notion"
                domain = "product"
            else:
                src_type = "github"
                domain = "code"

            rows.append({
                "id": str(uuid.uuid4()),
                "snapshot_id": snapshot_id,
                "project_id": project_id,
                "node_type": resolved_type,
                "label": str(label)[:500],
                "summary": str(summary or "")[:2000],
                "metadata": {k: v for k, v in item.items()
                             if k not in ("label", "summary", "detail", "rationale")},
                "source_file": source_file,
                "source_pr": None,
                "fingerprint": fp,
                "domain": domain,
                "source_type": src_type,
            })
    return rows


def _extract_edges(graph: dict, label_to_id: dict, snapshot_id: str, project_id: str) -> list[dict]:
    edges = []
    seen = set()

    def add_edge(from_label, to_label, edge_type, is_external=False):
        from_id = label_to_id.get(from_label.lower().strip())
        to_id = label_to_id.get(to_label.lower().strip())
        if not from_id or not to_id:
            return
        key = f"{from_id}:{to_id}:{edge_type}"
        if key in seen:
            return
        seen.add(key)
        edges.append({
            "id": str(uuid.uuid4()),
            "snapshot_id": snapshot_id,
            "project_id": project_id,
            "from_node": from_id,
            "to_node": to_id,
            "edge_type": edge_type,
            "weight": 1.0,
            "metadata": {"is_external": is_external},
        })

    for dep in graph.get("dependencies", []):
        if not isinstance(dep, dict):
            continue
        from_e = dep.get("from_entity", "")
        to_e = dep.get("to_entity", "")
        edge_type = EDGE_TYPE_MAP.get(dep.get("type", ""), "depends_on")
        if from_e and to_e:
            add_edge(from_e, to_e, edge_type, dep.get("is_external", False))

    for entity in graph.get("entities", []):
        if not isinstance(entity, dict):
            continue
        from_label = entity.get("label", "")
        for dep_label in entity.get("dependencies", []):
            if dep_label and from_label:
                add_edge(from_label, dep_label, "depends_on")

    return edges


async def write_brain(graph: dict, project_id: str, snapshot_id: str) -> dict:
    db = get_supabase()
    db.table("brain_snapshots").update({"status": "building"}).eq("id", snapshot_id).execute()

    nodes = _extract_nodes(graph, project_id, snapshot_id)
    log.info("brain_writer.writing_nodes", count=len(nodes))

    label_to_id = {}
    batch_size = 50
    for i in range(0, len(nodes), batch_size):
        batch = nodes[i:i + batch_size]
        db.table("brain_nodes").insert(batch).execute()
        for n in batch:
            label_to_id[n["label"].lower().strip()] = n["id"]

    edges = _extract_edges(graph, label_to_id, snapshot_id, project_id)
    if edges:
        for i in range(0, len(edges), batch_size):
            try:
                db.table("brain_edges").insert(edges[i:i + batch_size]).execute()
            except Exception as e:
                log.warning("brain_writer.edge_insert_failed", error=str(e)[:100])

    # Community detection
    communities = []
    try:
        from pipeline.community.detector import detect_communities
        communities = await detect_communities(project_id, snapshot_id, nodes)
        log.info("brain_writer.communities_done", count=len(communities))
        if communities:
            co_edges = await write_community_edges(communities, snapshot_id, project_id, db)
            log.info("brain_writer.community_edges_done", count=co_edges)
    except Exception as e:
        log.warning("brain_writer.community_detection_failed", error=str(e)[:200])

    by_type: dict[str, int] = {}
    for node in nodes:
        t = node["node_type"]
        by_type[t] = by_type.get(t, 0) + 1

    product_summary = graph.get("product_summary", {})
    metadata = {
        "total_nodes": len(nodes),
        "total_edges": len(edges),
        "total_communities": len(communities),
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
             nodes=len(nodes), edges=len(edges), communities=len(communities))
    return metadata


async def write_community_edges(communities: list[dict], snapshot_id: str, project_id: str, db):
    """Create weak edges between nodes in the same community."""
    import uuid
    rows = []
    seen = set()
    for community in communities:
        node_ids = community.get("node_ids", [])
        for i in range(len(node_ids)):
            for j in range(i + 1, min(i + 4, len(node_ids))):
                key = f"{node_ids[i]}:{node_ids[j]}"
                if key not in seen:
                    seen.add(key)
                    rows.append({
                        "id": str(uuid.uuid4()),
                        "snapshot_id": snapshot_id,
                        "project_id": project_id,
                        "from_node": node_ids[i],
                        "to_node": node_ids[j],
                        "edge_type": "co_community",
                        "weight": 0.3,
                        "metadata": {"community": community.get("label", "")},
                    })
    if rows:
        batch_size = 50
        for i in range(0, len(rows), batch_size):
            try:
                db.table("brain_edges").insert(rows[i:i+batch_size]).execute()
            except Exception:
                pass
    return len(rows)


async def get_existing_nodes(project_id: str, snapshot_id: str,
                             domain: str | None = None) -> tuple[list[dict], dict]:
    """Fetch existing brain nodes for a snapshot.

    Returns:
        (nodes_list, label_to_id_map)
    """
    db = get_supabase()
    query = (
        db.table("brain_nodes")
        .select("id, node_type, label, summary, domain, source_type")
        .eq("snapshot_id", snapshot_id)
        .eq("project_id", project_id)
    )
    if domain:
        query = query.eq("domain", domain)

    result = query.execute()
    nodes = result.data or []

    label_to_id = {}
    for n in nodes:
        label_to_id[n["label"].lower().strip()] = n["id"]

    return nodes, label_to_id


async def write_doc_nodes(graph: dict, project_id: str, snapshot_id: str) -> dict:
    """Write doc-sourced nodes and edges to an existing snapshot.

    Unlike write_brain() which creates a new snapshot, this appends
    to an existing one. Used for document ingestion on top of a
    code Brain.

    Returns dict with node/edge counts and the new label_to_id mapping.
    """
    db = get_supabase()

    nodes = _extract_nodes(graph, project_id, snapshot_id)
    log.info("brain_writer.writing_doc_nodes", count=len(nodes))

    if not nodes:
        return {"doc_nodes": 0, "doc_edges": 0, "label_to_id": {}}

    label_to_id = {}
    batch_size = 50
    for i in range(0, len(nodes), batch_size):
        batch = nodes[i:i + batch_size]
        try:
            db.table("brain_nodes").insert(batch).execute()
        except Exception as e:
            # Handle fingerprint conflicts (node already exists from prior ingest)
            log.warning("brain_writer.doc_node_conflict", error=str(e)[:100])
            # Insert one by one to skip conflicts
            for node in batch:
                try:
                    db.table("brain_nodes").insert(node).execute()
                except Exception:
                    pass
        for n in batch:
            label_to_id[n["label"].lower().strip()] = n["id"]

    # Also include existing nodes in label_to_id for edge resolution
    existing_nodes, existing_map = await get_existing_nodes(project_id, snapshot_id)
    full_label_to_id = {**existing_map, **label_to_id}

    edges = _extract_edges(graph, full_label_to_id, snapshot_id, project_id)
    if edges:
        for i in range(0, len(edges), batch_size):
            try:
                db.table("brain_edges").insert(edges[i:i + batch_size]).execute()
            except Exception as e:
                log.warning("brain_writer.doc_edge_failed", error=str(e)[:100])

    # Update snapshot metadata to reflect doc additions
    try:
        snap = db.table("brain_snapshots").select("metadata").eq("id", snapshot_id).single().execute()
        meta = snap.data.get("metadata", {}) if snap.data else {}
        meta["doc_nodes"] = meta.get("doc_nodes", 0) + len(nodes)
        meta["doc_edges"] = meta.get("doc_edges", 0) + len(edges)
        meta["total_nodes"] = meta.get("total_nodes", 0) + len(nodes)
        meta["total_edges"] = meta.get("total_edges", 0) + len(edges)
        db.table("brain_snapshots").update({"metadata": meta}).eq("id", snapshot_id).execute()
    except Exception as e:
        log.warning("brain_writer.metadata_update_failed", error=str(e)[:100])

    log.info("brain_writer.doc_write_complete", nodes=len(nodes), edges=len(edges))
    return {
        "doc_nodes": len(nodes),
        "doc_edges": len(edges),
        "label_to_id": label_to_id,
    }


async def write_cross_edges(edges: list[dict]) -> int:
    """Write cross-source linker edges to brain_edges table.

    Args:
        edges: pre-built edge dicts from linker.link_cross_source()

    Returns:
        Number of edges written.
    """
    if not edges:
        return 0

    db = get_supabase()
    batch_size = 50
    written = 0
    for i in range(0, len(edges), batch_size):
        try:
            db.table("brain_edges").insert(edges[i:i + batch_size]).execute()
            written += len(edges[i:i + batch_size])
        except Exception as e:
            log.warning("brain_writer.cross_edge_failed", error=str(e)[:100])

    log.info("brain_writer.cross_edges_written", count=written)
    return written
