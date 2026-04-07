import hashlib
import hmac
from fastapi import APIRouter, HTTPException, Header, Request
from core.config import settings
from core.database import get_supabase
from workers.build_brain import build_brain_task
from models.schemas import BrainStatus, BuildTrigger
import structlog
import uuid

router = APIRouter()
log = structlog.get_logger()


def _verify_github_signature(body: bytes, signature: str) -> bool:
    expected = hmac.new(
        settings.GITHUB_WEBHOOK_SECRET.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature)


@router.post("/github")
async def github_webhook(
    request: Request,
    x_github_event: str = Header(...),
    x_hub_signature_256: str = Header(...),
):
    body = await request.body()

    if not _verify_github_signature(body, x_hub_signature_256):
        raise HTTPException(status_code=401, detail="Invalid signature")

    payload = await request.json()

    # Only handle PR merge events
    if x_github_event != "pull_request":
        return {"status": "ignored", "event": x_github_event}

    action = payload.get("action")
    pr = payload.get("pull_request", {})
    is_merged = action == "closed" and pr.get("merged", False)

    if not is_merged:
        return {"status": "ignored", "reason": "not_merged"}

    repo_id = payload.get("repository", {}).get("id")
    pr_number = str(pr.get("number"))
    changed_files = _extract_changed_files(pr)

    # Find project by GitHub repo ID
    db = get_supabase()
    project = (
        db.table("projects")
        .select("id, config")
        .eq("github_repo_id", str(repo_id))
        .single()
        .execute()
    )

    if not project.data:
        log.warning("webhook.project_not_found", repo_id=repo_id)
        return {"status": "ignored", "reason": "project_not_found"}

    project_id = project.data["id"]

    # Check no active build
    active = (
        db.table("brain_snapshots")
        .select("id")
        .eq("project_id", project_id)
        .eq("status", BrainStatus.BUILDING)
        .execute()
    )
    if active.data:
        log.info("webhook.build_skipped_active", project_id=project_id)
        return {"status": "skipped", "reason": "build_in_progress"}

    # Get next version
    latest = (
        db.table("brain_snapshots")
        .select("version")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    next_version = (latest.data[0]["version"] + 1) if latest.data else 1

    snapshot_id = str(uuid.uuid4())
    db.table("brain_snapshots").insert({
        "id": snapshot_id,
        "project_id": project_id,
        "version": next_version,
        "status": BrainStatus.PENDING,
        "trigger": BuildTrigger.PR_MERGE,
        "trigger_ref": pr_number,
        "staleness_score": 0,
        "metadata": {"pr_number": pr_number, "changed_files": changed_files},
    }).execute()

    build_brain_task.delay(
        project_id=project_id,
        snapshot_id=snapshot_id,
        incremental=True,
        changed_files=changed_files,
    )

    # Update staleness on existing brain
    try:
        db.rpc("update_staleness", {"p_project_id": project_id, "pr_count": 1}).execute()
    except Exception:
        pass  # non-critical

    log.info("webhook.build_triggered", project_id=project_id, pr=pr_number)
    return {"status": "triggered", "snapshot_id": snapshot_id}


def _extract_changed_files(pr: dict) -> list[str]:
    """Extract file paths from PR. In real impl, call GitHub API for full list."""
    files = pr.get("changed_files_list", [])
    return [f.get("filename", "") for f in files if f.get("filename")]
