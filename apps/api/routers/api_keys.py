import secrets
import hashlib
import uuid
from fastapi import APIRouter, HTTPException, Header
from core.database import get_supabase
import structlog

router = APIRouter()
log = structlog.get_logger()


def _get_user_id(authorization: str) -> str:
    import jwt as pyjwt
    try:
        token = authorization.replace("Bearer ", "").strip()
        decoded = pyjwt.decode(token, options={"verify_signature": False})
        user_id = decoded.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user_id
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))


def _hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def verify_api_key(api_key: str) -> dict:
    db = get_supabase()
    key_hash = _hash_key(api_key)
    result = (
        db.table("api_keys")
        .select("*, projects(id, name)")
        .eq("key_hash", key_hash)
        .eq("is_active", True)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=401, detail="Invalid or inactive API key")
    return result.data


@router.post("/", status_code=201)
async def create_api_key(name: str, project_id: str, authorization: str = Header(...)):
    user_id = _get_user_id(authorization)
    db = get_supabase()
    raw_key = f"ctx_{secrets.token_urlsafe(32)}"
    key_hash = _hash_key(raw_key)
    key_prefix = raw_key[:12]
    result = db.table("api_keys").insert({
        "id": str(uuid.uuid4()),
        "name": name,
        "project_id": project_id,
        "key_hash": key_hash,
        "key_prefix": key_prefix,
        "created_by": user_id,
        "is_active": True,
    }).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create API key")
    log.info("api_key.created", prefix=key_prefix, project_id=project_id)
    return {**result.data[0], "key": raw_key}


@router.get("/")
async def list_api_keys(project_id: str, authorization: str = Header(...)):
    _get_user_id(authorization)
    db = get_supabase()
    result = (
        db.table("api_keys")
        .select("id, name, project_id, key_prefix, is_active, created_at")
        .eq("project_id", project_id)
        .eq("is_active", True)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


@router.delete("/{key_id}", status_code=204)
async def revoke_api_key(key_id: str, authorization: str = Header(...)):
    _get_user_id(authorization)
    db = get_supabase()
    db.table("api_keys").update({"is_active": False}).eq("id", key_id).execute()
