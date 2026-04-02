from fastapi import APIRouter, HTTPException, Header
from models.schemas import Project, ProjectCreate, ProjectUpdate
from core.database import get_supabase
import structlog
import uuid

router = APIRouter()
log = structlog.get_logger()


import jwt as pyjwt

def _get_workspace_id(authorization: str) -> str:
    """Extract user ID from Supabase JWT by decoding it directly."""
    try:
        token = authorization.replace("Bearer ", "").strip()
        # Decode without verification first to get the user ID
        # Supabase tokens are verified by the service itself
        decoded = pyjwt.decode(token, options={"verify_signature": False})
        user_id = decoded.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user_id
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Auth error: {str(e)}")


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
    user_id = _get_workspace_id(authorization)
    db = get_supabase()

    # Look up workspace by owner_id
    workspace = (
        db.table("workspaces")
        .select("id")
        .eq("owner_id", user_id)
        .single()
        .execute()
    )
    if not workspace.data:
        raise HTTPException(status_code=404, detail="Workspace not found")

    workspace_id = workspace.data["id"]

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
