from fastapi import APIRouter, HTTPException, Header, BackgroundTasks
from models.schemas import BrainBuildRequest, BrainSnapshot, BrainStats, BrainStatus
from core.database import get_supabase
from workers.build_brain import build_brain_task
import structlog
import uuid

router = APIRouter()
log = structlog.get_logger()


@router.post("/{project_id}/build", status_code=202)
async def trigger_build(
    project_id: str,
    payload: BrainBuildRequest,
    background_tasks: BackgroundTasks,
    authorization: str = Header(...),
):
    """Trigger a Brain build. Returns immediately — build runs in background."""
    db = get_supabase()

    # Check no active build running
    active = (
        db.table("brain_snapshots")
        .select("id")
        .eq("project_id", project_id)
        .eq("status", BrainStatus.BUILDING)
        .execute()
    )
    if active.data:
        raise HTTPException(status_code=409, detail="Build already in progress")

    # Get current version
    latest = (
        db.table("brain_snapshots")
        .select("version")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    next_version = (latest.data[0]["version"] + 1) if latest.data else 1

    # Create snapshot record
    snapshot_id = str(uuid.uuid4())
    db.table("brain_snapshots").insert({
        "id": snapshot_id,
        "project_id": project_id,
        "version": next_version,
        "status": BrainStatus.PENDING,
        "trigger": payload.trigger,
        "trigger_ref": payload.trigger_ref,
        "staleness_score": 0,
        "metadata": {
            "incremental": payload.incremental,
            "changed_files": payload.changed_files,
        },
    }).execute()

    # Dispatch to Celery worker
    build_brain_task.delay(
        project_id=project_id,
        snapshot_id=snapshot_id,
        incremental=payload.incremental,
        changed_files=payload.changed_files,
    )

    log.info("brain.build_triggered", project_id=project_id, snapshot_id=snapshot_id, version=next_version)
    return {"snapshot_id": snapshot_id, "version": next_version, "status": "pending"}


@router.get("/{project_id}/status")
async def get_brain_status(project_id: str, authorization: str = Header(...)):
    """Get latest snapshot status + stats."""
    db = get_supabase()
    result = (
        db.table("brain_snapshots")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not result.data:
        return {"status": "none", "message": "No Brain built yet"}

    snapshot = result.data[0]

    # Node counts by type
    nodes = (
        db.table("brain_nodes")
        .select("node_type")
        .eq("snapshot_id", snapshot["id"])
        .execute()
    )
    by_type: dict[str, int] = {}
    for node in (nodes.data or []):
        by_type[node["node_type"]] = by_type.get(node["node_type"], 0) + 1

    return {
        **snapshot,
        "stats": {
            "total_nodes": len(nodes.data or []),
            "by_type": by_type,
        },
    }


@router.get("/{project_id}/nodes")
async def get_brain_nodes(
    project_id: str,
    node_type: str | None = None,
    authorization: str = Header(...),
):
    """Get all brain nodes for the latest snapshot."""
    db = get_supabase()

    # Get latest complete snapshot
    snapshot = (
        db.table("brain_snapshots")
        .select("id")
        .eq("project_id", project_id)
        .eq("status", BrainStatus.COMPLETE)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not snapshot.data:
        raise HTTPException(status_code=404, detail="No complete Brain found")

    query = (
        db.table("brain_nodes")
        .select("id, node_type, label, summary, source_file, source_pr, metadata, created_at")
        .eq("snapshot_id", snapshot.data[0]["id"])
    )
    if node_type:
        query = query.eq("node_type", node_type)

    result = query.order("node_type").execute()
    return result.data


@router.get("/{project_id}/history")
async def get_build_history(project_id: str, authorization: str = Header(...)):
    db = get_supabase()
    result = (
        db.table("brain_snapshots")
        .select("id, version, status, trigger, built_at, staleness_score, metadata")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )
    return result.data
