export type NodeType = 'entity' | 'decision' | 'risk' | 'gap' | 'dependency' | 'flow' | 'api' | 'model'

export type BrainStatus = 'pending' | 'building' | 'complete' | 'failed'

export interface BrainSnapshot {
  id: string
  project_id: string
  version: number
  status: BrainStatus
  trigger: string
  trigger_ref?: string
  staleness_score: number
  built_at?: string
  metadata: Record<string, any>
  created_at: string
}

export interface BrainNode {
  id: string
  snapshot_id: string
  project_id: string
  node_type: NodeType
  label: string
  summary: string
  metadata: Record<string, any>
  source_file?: string
  fingerprint: string
  created_at: string
}

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
