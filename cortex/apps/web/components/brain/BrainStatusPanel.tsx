'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Brain, AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react'
import type { BrainSnapshot } from '@cortex/shared'

interface Props {
  snapshot?: BrainSnapshot | null
  projectId: string
}

const STATUS_CONFIG = {
  complete: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10', label: 'Brain active' },
  building: { icon: Loader2,      color: 'text-accent',  bg: 'bg-accent/10',  label: 'Building Brain…' },
  pending:  { icon: Loader2,      color: 'text-accent',  bg: 'bg-accent/10',  label: 'Starting build…' },
  failed:   { icon: XCircle,      color: 'text-danger',  bg: 'bg-danger/10',  label: 'Build failed' },
}

export default function BrainStatusPanel({ snapshot: initialSnapshot, projectId }: Props) {
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const supabase = createClient()

  // Realtime subscription — auto-updates when build completes
  useEffect(() => {
    const channel = supabase
      .channel(`brain-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'brain_snapshots',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          setSnapshot(payload.new as BrainSnapshot)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [projectId])

  if (!snapshot) {
    return (
      <div className="card p-6 flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-surface-2 border border-border flex items-center justify-center">
          <Brain className="w-5 h-5 text-muted" />
        </div>
        <div>
          <p className="text-sm text-foreground">No Brain built yet</p>
          <p className="text-xs text-foreground-2 mt-0.5">
            Trigger a build to start ingesting your codebase.
          </p>
        </div>
      </div>
    )
  }

  const config = STATUS_CONFIG[snapshot.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending
  const StatusIcon = config.icon
  const isActive = snapshot.status === 'building' || snapshot.status === 'pending'
  const staleness = snapshot.staleness_score || 0

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center`}>
            <StatusIcon className={`w-4 h-4 ${config.color} ${isActive ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{config.label}</p>
            <p className="text-2xs text-foreground-2 mt-0.5">
              v{snapshot.version}
              {snapshot.built_at && ` · Built ${new Date(snapshot.built_at).toLocaleDateString()}`}
            </p>
          </div>
        </div>

        {snapshot.status === 'complete' && staleness > 0 && (
          <div className="flex items-center gap-1.5">
            <AlertTriangle className={`w-3.5 h-3.5 ${staleness >= 0.5 ? 'text-danger' : 'text-warning'}`} />
            <span className={`text-xs ${staleness >= 0.5 ? 'text-danger' : 'text-warning'}`}>
              {Math.round(staleness * 100)}% stale
            </span>
          </div>
        )}
      </div>

      {/* Build progress bar */}
      {isActive && (
        <div className="space-y-1.5">
          <div className="h-0.5 bg-surface-3 rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full animate-brain-build" style={{ width: '60%' }} />
          </div>
          <div className="flex justify-between text-2xs text-muted">
            <span>Ingesting codebase → extracting entities → synthesising graph</span>
            <span>~2–5 min</span>
          </div>
        </div>
      )}

      {/* Error */}
      {snapshot.status === 'failed' && snapshot.metadata?.error && (
        <div className="bg-danger/5 border border-danger/20 rounded px-3 py-2">
          <p className="text-2xs text-danger font-mono">{snapshot.metadata.error as string}</p>
        </div>
      )}

      {/* Stats */}
      {snapshot.status === 'complete' && snapshot.metadata?.total_nodes && (
        <div className="flex items-center gap-4 pt-1 border-t border-border">
          <span className="text-2xs text-foreground-2">
            <span className="text-foreground font-medium">{snapshot.metadata.total_nodes}</span> nodes
          </span>
          {snapshot.metadata?.product_summary?.total_apis && (
            <span className="text-2xs text-foreground-2">
              <span className="text-foreground font-medium">{snapshot.metadata.product_summary.total_apis}</span> APIs
            </span>
          )}
          {snapshot.metadata?.product_summary?.architecture_pattern && (
            <span className="badge-muted">{snapshot.metadata.product_summary.architecture_pattern}</span>
          )}
        </div>
      )}
    </div>
  )
}
