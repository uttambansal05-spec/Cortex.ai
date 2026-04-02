'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import { Brain, GitBranch, Loader2, RefreshCw, ArrowLeft, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

export default function ProjectPage() {
  const [project, setProject] = useState<any>(null)
  const [snapshot, setSnapshot] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [building, setBuilding] = useState(false)
  const [session, setSession] = useState<any>(null)
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/auth/login'); return }
      setSession(session)
      const { data: proj } = await supabase.from('projects').select('*').eq('id', projectId).single()
      if (!proj) { router.replace('/dashboard'); return }
      setProject(proj)
      const { data: snaps } = await supabase.from('brain_snapshots').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1)
      if (snaps?.length) setSnapshot(snaps[0])
      setLoading(false)
    }
    load()
    const channel = supabase.channel(`brain-${projectId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'brain_snapshots', filter: `project_id=eq.${projectId}` },
        (payload) => { setSnapshot(payload.new); if (['complete','failed'].includes(payload.new.status)) setBuilding(false) })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'brain_snapshots', filter: `project_id=eq.${projectId}` },
        (payload) => setSnapshot(payload.new))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [projectId])

  const handleBuild = async () => {
    if (!session) return
    setBuilding(true)
    const res = await fetch(`/api/brain/${projectId}/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ trigger: 'manual', incremental: false }),
    })
    if (!res.ok) { setBuilding(false); const err = await res.json(); alert(err.error || 'Build failed') }
  }

  if (loading) return <div className="flex items-center justify-center h-screen"><Brain className="w-4 h-4 text-accent animate-pulse" /></div>

  const isBuilding = building || ['building','pending'].includes(snapshot?.status)
  const metadata = snapshot?.metadata || {}
  const staleness = snapshot?.staleness_score || 0

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/dashboard" className="btn-ghost mb-3 -ml-1 inline-flex"><ArrowLeft className="w-3.5 h-3.5" />Projects</Link>
          <h1 className="text-base font-medium text-foreground">{project?.name}</h1>
          {project?.github_repo_url && (
            <a href={project.github_repo_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 mt-1 text-2xs text-muted hover:text-foreground-2 font-mono">
              <GitBranch className="w-3 h-3" />{project.github_repo_url.replace('https://github.com/', '')}
            </a>
          )}
        </div>
        <button onClick={handleBuild} disabled={isBuilding} className="btn-primary">
          {isBuilding ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Building…</> :
           snapshot ? <><RefreshCw className="w-3.5 h-3.5" />Rebuild Brain</> :
           <><Brain className="w-3.5 h-3.5" />Build Brain</>}
        </button>
      </div>
      <div className="card p-5 space-y-4">
        {!snapshot ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-surface-2 border border-border flex items-center justify-center">
              <Brain className="w-4 h-4 text-muted" />
            </div>
            <div>
              <p className="text-sm text-foreground">No Brain built yet</p>
              <p className="text-xs text-foreground-2 mt-0.5">Click "Build Brain" to start ingesting the codebase.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${snapshot.status === 'complete' ? 'bg-success/10' : snapshot.status === 'failed' ? 'bg-danger/10' : 'bg-accent/10'}`}>
                  {isBuilding ? <Loader2 className="w-4 h-4 text-accent animate-spin" /> : <Brain className={`w-4 h-4 ${snapshot.status === 'complete' ? 'text-success' : 'text-danger'}`} />}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {isBuilding ? 'Building Brain…' : snapshot.status === 'complete' ? 'Brain active' : snapshot.status === 'failed' ? 'Build failed' : snapshot.status}
                  </p>
                  <p className="text-2xs text-foreground-2 mt-0.5">v{snapshot.version}{snapshot.built_at && ` · Built ${new Date(snapshot.built_at).toLocaleDateString()}`}</p>
                </div>
              </div>
              {snapshot.status === 'complete' && staleness > 0 && (
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className={`w-3.5 h-3.5 ${staleness >= 0.5 ? 'text-danger' : 'text-warning'}`} />
                  <span className={`text-xs ${staleness >= 0.5 ? 'text-danger' : 'text-warning'}`}>{Math.round(staleness * 100)}% stale</span>
                </div>
              )}
            </div>
            {isBuilding && (
              <div className="space-y-1.5">
                <div className="h-0.5 bg-surface-3 rounded-full overflow-hidden">
                  <div className="h-full bg-accent rounded-full animate-brain-build" style={{ width: '60%' }} />
                </div>
                <p className="text-2xs text-muted">Ingesting codebase → extracting entities → synthesising graph · ~2–5 min</p>
              </div>
            )}
            {snapshot.status === 'failed' && metadata.error && (
              <div className="bg-danger/5 border border-danger/20 rounded px-3 py-2">
                <p className="text-2xs text-danger font-mono">{metadata.error}</p>
              </div>
            )}
            {snapshot.status === 'complete' && metadata.total_nodes && (
              <div className="flex items-center gap-4 pt-1 border-t border-border">
                <span className="text-2xs text-foreground-2"><span className="text-foreground font-medium">{metadata.total_nodes}</span> nodes</span>
                {metadata.product_summary?.architecture_pattern && <span className="badge-muted">{metadata.product_summary.architecture_pattern}</span>}
              </div>
            )}
          </>
        )}
      </div>
      {snapshot?.status === 'complete' && metadata.product_summary?.what_it_does && (
        <div className="card p-5">
          <h3 className="label mb-2">Brain Summary</h3>
          <p className="text-sm text-foreground-2 leading-relaxed">{metadata.product_summary.what_it_does}</p>
          {metadata.product_summary.tech_stack?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {metadata.product_summary.tech_stack.map((t: string) => <span key={t} className="badge-muted">{t}</span>)}
            </div>
          )}
        </div>
      )}
      {snapshot?.status === 'complete' && metadata.by_type && (
        <div className="grid grid-cols-4 gap-3">
          {Object.entries(metadata.by_type).map(([type, count]) => (
            <div key={type} className="card p-4">
              <div className={`node-${type} mb-2 w-fit`}>{type}</div>
              <div className="text-xl font-medium text-foreground">{count as number}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
