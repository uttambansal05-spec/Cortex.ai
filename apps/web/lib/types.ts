export type NodeType = 'entity' | 'decision' | 'risk' | 'gap' | 'dependency' | 'flow' | 'api' | 'model' | 'config'

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
  entity:     { label: 'Entity',      color: '#818CF8' },
  decision:   { label: 'Decision',    color: '#34D399' },
  risk:       { label: 'Risk',        color: '#F87171' },
  gap:        { label: 'Gap',         color: '#FBBF24' },
  dependency: { label: 'Dependency',  color: '#64748B' },
  flow:       { label: 'Flow',        color: '#22D3EE' },
  api:        { label: 'API',         color: '#F472B6' },
  model:      { label: 'Model',       color: '#60A5FA' },
  config:     { label: 'Config',      color: '#A78BFA' },
}
