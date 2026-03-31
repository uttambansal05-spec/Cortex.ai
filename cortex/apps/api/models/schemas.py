from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime
from enum import Enum
import uuid


# ─── Enums ────────────────────────────────────────────────────────────────────

class BrainStatus(str, Enum):
    PENDING  = "pending"
    BUILDING = "building"
    COMPLETE = "complete"
    FAILED   = "failed"

class BuildTrigger(str, Enum):
    MANUAL   = "manual"
    PR_MERGE = "pr_merge"
    SCHEDULED = "scheduled"

class NodeType(str, Enum):
    ENTITY     = "entity"
    DECISION   = "decision"
    RISK       = "risk"
    GAP        = "gap"
    DEPENDENCY = "dependency"
    FLOW       = "flow"
    API        = "api"
    MODEL      = "model"

class IntakeStatus(str, Enum):
    PENDING   = "pending"
    ANALYSED  = "analysed"
    ACCEPTED  = "accepted"
    REJECTED  = "rejected"
    DUPLICATE = "duplicate"


# ─── Project ──────────────────────────────────────────────────────────────────

class ProjectConfig(BaseModel):
    ingest_scope: list[str] = ["code", "prs"]
    ignore_patterns: list[str] = []
    default_branch: str = "main"
    notion_database_id: Optional[str] = None

class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    github_repo_url: str
    config: ProjectConfig = Field(default_factory=ProjectConfig)

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    github_repo_url: Optional[str] = None
    config: Optional[ProjectConfig] = None

class Project(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    name: str
    github_repo_url: Optional[str]
    github_repo_id: Optional[int]
    config: ProjectConfig
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Brain ────────────────────────────────────────────────────────────────────

class BrainBuildRequest(BaseModel):
    trigger: BuildTrigger = BuildTrigger.MANUAL
    trigger_ref: Optional[str] = None   # PR number or commit SHA
    incremental: bool = False
    changed_files: list[str] = []       # for incremental builds

class BrainSnapshot(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    version: int
    status: BrainStatus
    trigger: BuildTrigger
    trigger_ref: Optional[str]
    staleness_score: float
    built_at: Optional[datetime]
    metadata: dict[str, Any] = {}
    created_at: datetime

class BrainNode(BaseModel):
    id: uuid.UUID
    snapshot_id: uuid.UUID
    project_id: uuid.UUID
    node_type: NodeType
    label: str
    summary: str
    metadata: dict[str, Any] = {}
    source_file: Optional[str]
    source_pr: Optional[str]
    source_prd_id: Optional[uuid.UUID]
    fingerprint: str
    created_at: datetime

class BrainStats(BaseModel):
    total_nodes: int
    by_type: dict[str, int]
    staleness_score: float
    last_built_at: Optional[datetime]
    version: int
    files_ingested: int
    prs_processed: int


# ─── Agents ───────────────────────────────────────────────────────────────────

class QueryRequest(BaseModel):
    project_id: uuid.UUID
    question: str = Field(..., min_length=3, max_length=2000)

class QueryResponse(BaseModel):
    answer: str
    source_nodes: list[dict[str, Any]]
    staleness_warning: Optional[str]
    tokens_used: int

class PRDStep1(BaseModel):
    project_id: uuid.UUID
    feature_name: str = Field(..., min_length=3, max_length=200)

class PRDStep1Response(BaseModel):
    session_id: str
    what_i_know: dict[str, Any]       # from Brain
    questions: list[dict[str, str]]   # only business questions Brain can't answer

class PRDStep2(BaseModel):
    session_id: str
    answers: dict[str, str]           # question_id → answer

class PRDResponse(BaseModel):
    id: uuid.UUID
    feature_name: str
    content: str
    notion_url: Optional[str]
    metadata: dict[str, Any]
    created_at: datetime

class IntakeRequest(BaseModel):
    project_id: uuid.UUID
    title: str = Field(..., min_length=3, max_length=200)
    description: str = Field(..., min_length=10, max_length=5000)

class IntakeResponse(BaseModel):
    id: uuid.UUID
    title: str
    status: IntakeStatus
    analysis: dict[str, Any]   # known_from_brain, gaps, duplicates, feasibility
    created_at: datetime


# ─── Webhooks ─────────────────────────────────────────────────────────────────

class GitHubWebhookPayload(BaseModel):
    action: Optional[str] = None
    pull_request: Optional[dict[str, Any]] = None
    repository: Optional[dict[str, Any]] = None
    installation: Optional[dict[str, Any]] = None
