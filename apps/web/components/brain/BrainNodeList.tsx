'use client'

import { useState, useEffect } from 'react'
import { NODE_TYPE_CONFIG, type NodeType, type BrainNode } from '@/lib/types'

const TYPES: NodeType[] = ['entity', 'decision', 'risk', 'gap', 'dependency', 'flow', 'api', 'model']

export default function BrainNodeList({ projectId }: { projectId: string }) {
  const [nodes, setNodes] = useState<BrainNode[]>([])
  const [filter, setFilter] = useState<NodeType | 'all'>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const url = filter === 'all'
      ? `/api/v1/brain/${projectId}/nodes`
      : `/api/v1/brain/${projectId}/nodes?node_type=${filter}`

    fetch(url)
      .then(r => r.json())
      .then(data => { setNodes(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [projectId, filter])

  const displayed = nodes.slice(0, 50)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="label">Brain nodes</h3>
        <span className="text-2xs text-muted">{nodes.length} total</span>
      </div>

      {/* Type filter */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setFilter('all')}
          className={`badge cursor-pointer transition-colors ${
            filter === 'all' ? 'bg-surface-3 text-foreground' : 'bg-surface-2 text-muted hover:text-foreground-2'
          }`}
        >
          All
        </button>
        {TYPES.map(type => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            className={`node-${type} cursor-pointer transition-opacity ${
              filter === type ? 'opacity-100' : 'opacity-50 hover:opacity-75'
            }`}
          >
            {NODE_TYPE_CONFIG[type].label}
          </button>
        ))}
      </div>

      {/* Nodes */}
      {loading ? (
        <div className="space-y-1.5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="card-2 h-14 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {displayed.map(node => (
            <NodeRow key={node.id} node={node} />
          ))}
          {nodes.length > 50 && (
            <p className="text-center text-xs text-muted py-2">
              Showing 50 of {nodes.length} nodes
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function NodeRow({ node }: { node: BrainNode }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="card-2 px-4 py-3 cursor-pointer hover:border-border-2 transition-colors"
      onClick={() => setExpanded(e => !e)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`node-${node.node_type} flex-shrink-0`}>
            {NODE_TYPE_CONFIG[node.node_type]?.label || node.node_type}
          </span>
          <span className="text-sm text-foreground truncate">{node.label}</span>
        </div>
        {node.source_file && (
          <span className="text-2xs text-muted font-mono flex-shrink-0 hidden sm:block">
            {node.source_file.split('/').slice(-2).join('/')}
          </span>
        )}
      </div>
      {expanded && node.summary && (
        <p className="text-xs text-foreground-2 mt-2 leading-relaxed">{node.summary}</p>
      )}
    </div>
  )
}
