'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Brain, RefreshCw, Search, GitGraph, ArrowLeft, AlertCircle, Clock } from 'lucide-react'

export default function ProjectPage() {
  const [project, setProject] = useState<any>(null)
  const [snapshot, setSnapshot] = useState<any>(null)
  const [building, setBuilding] = useState(false)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/auth/login'); return }

      const { data: proj } = await supabase
        .from('projects').select('*').eq('id', id).single()
      if (!proj) { router.replace('/dashboard'); return }
      setProject(proj)

      await loadSnapshot(id)
      setLoading(false)

      const channel = supabase.channel(`snapshot-${id}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'brain_snapshots',
          filter: `project_id=eq.${id}`,
        }, () => loadSnapshot(id))
        .subscribe()
      return () => { supabase.removeChannel(channel) }
    }
    load()
  }, [id])

  const loadSnapshot = async (projectId: string) => {
    const { data } = await supabase
      .from('brain_snapshots')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
    setSnapshot(data?.[0] || null)
    if (data?.[0]?.status === 'building') setBuilding(true)
    else setBuilding(false)
  }

  const handleBuild = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    setBuilding(true)
    try {
      const res = await fetch(`/api/brain/${id}/build`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      })
      if (!res.ok) {
        const err = await res.text()
        console.error('Build failed:', err)
        setBuilding(false)
      }
    } catch (e) {
      console.error('Build error:', e)
      setBuilding(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Brain className="w-4 h-4 text-accent animate-pulse" />
    </div>
  )

  const meta = snapshot?.metadata || {}
  const isComplete = snapshot?.status === 'complete'
  const isFailed = snapshot?.status === 'failed'
  const byType = meta.by_type || {}
  const productSummary = meta.product_summary || {}
  const techStack = productSummary.tech_stack || []

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/dashboard" className="text-foreground-2 hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-base font-medium text-foreground">{project?.name}</h1>
          <p className="text-xs text-foreground-2 mt-0.5">{project?.github_repo_url?.replace('https://github.com/', '')}</p>
        </div>
        <button
          onClick={handleBuild}
          disabled={building}
          className="btn-primary flex items-center gap-2"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${building ? 'animate-spin' : ''}`} />
          {building ? 'Building…' : isComplete ? 'Rebuild Brain' : 'Build Brain'}
        </button>
      </div>

      <div className="card p-5 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isComplete ? 'bg-accent/10 border border-accent/20' : 'bg-surface-2 border border-border'}`}>
            <Brain className={`w-4 h-4 ${isComplete ? 'text-accent' : 'text-muted'}`} />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {building ? 'Building Brain…' : isComplete ? 'Brain active' : isFailed ? 'Build failed' : 'No brain yet'}
            </p>
            {snapshot?.version && (
              <p className="text-xs text-foreground-2">
                v{snapshot.version}
                {snapshot.built_at && ` · Built ${new Date(snapshot.built_at).toLocaleDateString()}`}
              </p>
            )}
          </div>
        </div>

        {isFailed && (
          <div className="flex items-center gap-2 p-3 bg-danger/5 border border-danger/20 rounded-lg mb-4">
            <AlertCircle className="w-3.5 h-3.5 text-danger flex-shrink-0" />
            <p className="text-xs text-danger">{meta?.error || 'Build failed'}</p>
          </div>
        )}

        {building && (
          <div className="flex items-center gap-2 p-3 bg-accent/5 border border-accent/20 rounded-lg mb-4">
            <Clock className="w-3.5 h-3.5 text-accent flex-shrink-0 animate-pulse" />
            <p className="text-xs text-accent">Building knowledge graph — this takes 5-15 minutes</p>
          </div>
        )}

        {isComplete && Object.keys(byType).length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            {Object.entries(byType).map(([type, count]) => (
              <div key={type} className="bg-surface-2 rounded-lg p-3">
                <p className="text-lg font-medium text-foreground">{count as number}</p>
                <p className="text-xs text-foreground-2 capitalize">{type}</p>
              </div>
            ))}
          </div>
        )}

        {isComplete && productSummary.what_it_does && (
          <p className="text-xs text-foreground-2 leading-relaxed mb-3">{productSummary.what_it_does}</p>
        )}

        {isComplete && techStack.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {techStack.map((t: string) => (
              <span key={t} className="badge-muted">{t}</span>
            ))}
            {productSummary.architecture_pattern && (
              <span className="badge-accent">{productSummary.architecture_pattern}</span>
            )}
          </div>
        )}
      </div>

      {isComplete && (
        <div className="grid grid-cols-2 gap-4">
          <Link href={`/dashboard/query?project=${id}`} className="card p-5 hover:border-border-2 transition-colors group block">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
                <Search className="w-4 h-4 text-accent" />
              </div>
              <p className="text-sm font-medium text-foreground">Query Brain</p>
            </div>
            <p className="text-xs text-foreground-2 leading-relaxed">
              Ask questions about the codebase in plain English. Get answers grounded in the knowledge graph.
            </p>
          </Link>

          <Link href={`/dashboard/brain?project=${id}`} className="card p-5 hover:border-border-2 transition-colors group block">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-surface-2 border border-border flex items-center justify-center">
                <GitGraph className="w-4 h-4 text-foreground-2 group-hover:text-accent transition-colors" />
              </div>
              <p className="text-sm font-medium text-foreground">Brain Map</p>
            </div>
            <p className="text-xs text-foreground-2 leading-relaxed">
              Visualise the knowledge graph. Explore nodes, edges and communities interactively.
            </p>
          </Link>
        </div>
      )}
    </div>
  )
}
