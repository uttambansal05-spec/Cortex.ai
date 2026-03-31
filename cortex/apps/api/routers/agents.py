from fastapi import APIRouter, HTTPException, Header
from models.schemas import (
    QueryRequest, QueryResponse,
    PRDStep1, PRDStep1Response,
    PRDStep2, PRDResponse,
    IntakeRequest, IntakeResponse,
)
from agents.query import QueryAgent
from agents.prd import PRDAgent
from agents.intake import IntakeAgent
import structlog

router = APIRouter()
log = structlog.get_logger()

query_agent  = QueryAgent()
prd_agent    = PRDAgent()
intake_agent = IntakeAgent()


@router.post("/query", response_model=QueryResponse)
async def query_brain(
    payload: QueryRequest,
    authorization: str = Header(...),
):
    """Ask the Brain a question. Returns answer + source nodes."""
    try:
        result = await query_agent.run(
            project_id=str(payload.project_id),
            question=payload.question,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        log.error("query_agent.error", error=str(e))
        raise HTTPException(status_code=500, detail="Query failed")


@router.post("/prd/start", response_model=PRDStep1Response)
async def start_prd(
    payload: PRDStep1,
    authorization: str = Header(...),
):
    """Step 1: Brain surfaces what it knows. Returns only business questions."""
    try:
        result = await prd_agent.start(
            project_id=str(payload.project_id),
            feature_name=payload.feature_name,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/prd/complete", response_model=PRDResponse)
async def complete_prd(
    payload: PRDStep2,
    authorization: str = Header(...),
):
    """Step 2: User answers business questions. Generates + saves PRD."""
    try:
        result = await prd_agent.complete(
            session_id=payload.session_id,
            answers=payload.answers,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/prd/{project_id}")
async def list_prds(project_id: str, authorization: str = Header(...)):
    from core.database import get_supabase
    db = get_supabase()
    result = (
        db.table("prds")
        .select("id, feature_name, notion_url, status, created_at")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


@router.post("/intake", response_model=IntakeResponse)
async def submit_intake(
    payload: IntakeRequest,
    authorization: str = Header(...),
):
    """Submit a feature request for Brain analysis."""
    try:
        result = await intake_agent.run(
            project_id=str(payload.project_id),
            title=payload.title,
            description=payload.description,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/intake/{project_id}")
async def list_intake(project_id: str, authorization: str = Header(...)):
    from core.database import get_supabase
    db = get_supabase()
    result = (
        db.table("intake_requests")
        .select("id, title, status, cortex_analysis, created_at")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data
