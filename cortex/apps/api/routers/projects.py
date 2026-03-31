from fastapi import APIRouter, HTTPException, Header
from models.schemas import Project, ProjectCreate, ProjectUpdate
from core.database import get_supabase
import structlog
import uuid

router = APIRouter()
log = structlog.get_logger()


def _get_workspace_id(authorization: str) -> str:
    """Extract user ID from Supabase JWT — simplified; use proper JWT decode in prod."""
    supabase = get_supabase()
    user = supabase.auth.get_user(authorization.replace("Bearer ", ""))
    if not user.user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return user.user.id


@router.get("/")
async def list_projects(authorization: str = Header(...)):
    workspace_id = _get_workspace_id(authorization)
    db = get_supabase()
    result = (
        db.table("projects")
        .select("*, brain_snapshots(id, version, status, built_at, staleness_score)")
        .eq("workspace_id", workspace_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


@router.post("/", status_code=201)
async def create_project(
    payload: ProjectCreate,
    authorization: str = Header(...),
):
    workspace_id = _get_workspace_id(authorization)
    db = get_supabase()

    # Extract GitHub repo ID from URL
    repo_parts = payload.github_repo_url.rstrip("/").split("/")
    repo_name = f"{repo_parts[-2]}/{repo_parts[-1]}"

    result = (
        db.table("projects")
        .insert({
            "id": str(uuid.uuid4()),
            "workspace_id": workspace_id,
            "name": payload.name,
            "github_repo_url": payload.github_repo_url,
            "config": payload.config.model_dump(),
        })
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create project")

    log.info("project.created", project_id=result.data[0]["id"], workspace_id=workspace_id)
    return result.data[0]


@router.get("/{project_id}")
async def get_project(project_id: str, authorization: str = Header(...)):
    workspace_id = _get_workspace_id(authorization)
    db = get_supabase()
    result = (
        db.table("projects")
        .select("*, brain_snapshots(id, version, status, built_at, staleness_score, metadata)")
        .eq("id", project_id)
        .eq("workspace_id", workspace_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Project not found")
    return result.data


@router.patch("/{project_id}")
async def update_project(
    project_id: str,
    payload: ProjectUpdate,
    authorization: str = Header(...),
):
    workspace_id = _get_workspace_id(authorization)
    db = get_supabase()
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = (
        db.table("projects")
        .update(updates)
        .eq("id", project_id)
        .eq("workspace_id", workspace_id)
        .execute()
    )
    return result.data[0]


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: str, authorization: str = Header(...)):
    workspace_id = _get_workspace_id(authorization)
    db = get_supabase()
    db.table("projects").delete().eq("id", project_id).eq("workspace_id", workspace_id).execute()
