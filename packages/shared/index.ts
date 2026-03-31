// Shared types used by both web and API
// Mirrors apps/api/models/schemas.py

export type BrainStatus = 'pending' | 'building' | 'complete' | 'failed'
export type BuildTrigger = 'manual' | 'pr_merge' | 'scheduled'
export type NodeType = 'entity' | 'decision' | 'risk' | 'gap' | 'dependency' | 'flow' | 'api' | 'model'
export type IntakeStatus = 'pending' | 'analysed' | 'accepted' | 'rejected' | 'duplicate'
export type PRDStatus = 'draft' | 'review' | 'approved' | 'archived'

export interface ProjectConfig {
  ingest_scope: string[]
  ignore_patterns: string[]
  default_branch: string
  notion_database_id?: string
}

export interface Project {
  id: string
  workspace_id: string
  name: string
  github_repo_url?: string
  github_repo_id?: number
  config: ProjectConfig
  created_at: string
  brain_snapshots?: BrainSnapshot[]
}

export interface BrainSnapshot {
  id: string
  project_id: string
  version: number
  status: BrainStatus
  trigger: BuildTrigger
  trigger_ref?: string
  staleness_score: number
  built_at?: string
  metadata: {
    total_nodes?: number
    by_type?: Record<NodeType, number>
    product_summary?: ProductSummary
    files_ingested?: number
    error?: string
  }
  created_at: string
}

export interface BrainNode {
  id: string
  snapshot_id: string
  project_id: string
  node_type: NodeType
  label: string
  summary: string
  metadata: Record<string, unknown>
  source_file?: string
  source_pr?: string
  source_prd_id?: string
  fingerprint: string
  created_at: string
}

export interface ProductSummary {
  what_it_does: string
  core_modules: string[]
  primary_data_model: string
  critical_paths: string[]
  tech_stack: string[]
  total_entities: number
  total_apis: number
  architecture_pattern: string
}

export interface QueryResponse {
  answer: string
  source_nodes: Array<{
    id: string
    label: string
    type: NodeType
    source_file?: string
  }>
  staleness_warning?: string
  tokens_used: number
}

export interface PRDStep1Response {
  session_id: string
  what_i_know: {
    existing_architecture?: string
    affected_modules?: string[]
    technical_constraints?: string[]
    estimated_effort?: string
    existing_apis?: string[]
    risks?: string[]
    dependencies?: string[]
  }
  questions: Array<{
    id: string
    question: string
    why_needed: string
    type: 'text' | 'select' | 'multiline'
  }>
}

export interface PRD {
  id: string
  project_id: string
  feature_name: string
  content: string
  notion_url?: string
  status: PRDStatus
  metadata: Record<string, unknown>
  created_at: string
}

export interface IntakeAnalysis {
  status: 'new' | 'partial_exists' | 'duplicate' | 'unfeasible'
  known_from_brain: {
    existing_relevant_code?: string
    affected_modules?: string[]
    relevant_apis?: string[]
    effort_estimate?: string
  }
  gaps: Array<{ question: string; category: string }>
  duplicates: Array<{ label: string; overlap: string; source_file?: string }>
  risks: Array<{ label: string; severity: string; detail: string }>
  recommendation: string
  recommendation_reason: string
}

export interface IntakeRequest {
  id: string
  project_id: string
  title: string
  status: IntakeStatus
  analysis: IntakeAnalysis
  created_at: string
}

// Node type display config
export const NODE_TYPE_CONFIG: Record<NodeType, { label: string; color: string }> = {
  entity:     { label: 'Entity',      color: '#6366F1' },
  decision:   { label: 'Decision',    color: '#8B5CF6' },
  risk:       { label: 'Risk',        color: '#EF4444' },
  gap:        { label: 'Gap',         color: '#F59E0B' },
  dependency: { label: 'Dependency',  color: '#06B6D4' },
  flow:       { label: 'Flow',        color: '#22C55E' },
  api:        { label: 'API',         color: '#EC4899' },
  model:      { label: 'Model',       color: '#F97316' },
}
