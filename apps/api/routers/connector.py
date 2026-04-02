from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, Field
from agents.query import QueryAgent
from routers.api_keys import verify_api_key
import structlog

router = APIRouter()
log = structlog.get_logger()
query_agent = QueryAgent()


class ConnectorQueryRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=2000)
    project_id: str | None = None


class ConnectorQueryResponse(BaseModel):
    answer: str
    source_nodes: list[dict]
    staleness_warning: str | None
    tokens_used: int
    project: str


@router.post("/query")
async def connector_query(
    payload: ConnectorQueryRequest,
    x_cortex_key: str = Header(..., alias="x-cortex-key"),
):
    """
    Public Brain query endpoint. Authenticate with your Cortex API key.
    
    Headers:
      x-cortex-key: ctx_your_api_key_here
    
    Body:
      { "question": "What does this product do?", "project_id": "optional-uuid" }
    """
    key_data = verify_api_key(x_cortex_key)
    project_id = payload.project_id or key_data["project_id"]

    try:
        result = await query_agent.run(
            project_id=project_id,
            question=payload.question,
        )
        return ConnectorQueryResponse(
            answer=result.answer,
            source_nodes=result.source_nodes,
            staleness_warning=result.staleness_warning,
            tokens_used=result.tokens_used,
            project=key_data.get("projects", {}).get("name", project_id),
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        log.error("connector.query_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Query failed")


@router.get("/health")
async def connector_health(x_cortex_key: str = Header(..., alias="x-cortex-key")):
    """Verify your API key is valid."""
    key_data = verify_api_key(x_cortex_key)
    return {
        "status": "ok",
        "project": key_data.get("projects", {}).get("name"),
        "project_id": key_data["project_id"],
    }
