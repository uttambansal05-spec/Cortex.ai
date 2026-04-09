'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Plus, Brain, GitBranch, Clock, AlertTriangle, Loader2, Zap } from 'lucide-react'
import Link from 'next/link'

export default function DashboardPage() {
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/auth/login'); return }

      const { data: workspace } = await supabase
        .from('workspaces').select('id').eq('owner_id', session.user.id).single()
      if (!workspace) { setLoading(false); return }

      const { data: projectData } = await supabase
        .from('projects')
        .select('*, brain_snapshots(id, version, status, built_at, staleness_score, metadata)')
        .eq('workspace_id', workspace.id)
        .order('created_at', { ascending: false })

      setProjects(projectData || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 className="w-4 h-4 text-accent animate-spin" />
    </div>
  )

  return (
    <div className="p-9 max-w-[960px] mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-2xl font-display font-semibold text-text-0 tracking-tight">Projects</h1>
          <p className="text-[13px] text-text-2 mt-1">
            {projects.length} project{projects.length !== 1 ? 's' : ''} connected
          </p>
        </div>
        <Link href="/dashboard/projects/new" className="btn-primary">
          <Plus className="w-3.5 h-3.5" /> New project
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center animate-fade-in">
          <div className="w-14 h-14 rounded-2xl bg-bg-2 border border-border flex items-center justify-center mb-5">
            <Brain className="w-6 h-6 text-text-2" />
          </div>
          <h3 className="text-sm font-display font-medium text-text-0 mb-1.5">No projects yet</h3>
          <p className="text-xs text-text-2 mb-6 max-w-xs leading-relaxed">
            Connect a GitHub repo to build your first Product Brain.
          </p>
          <Link href="/dashboard/projects/new" className="btn-primary">
            <Plus className="w-3.5 h-3.5" /> Create first project
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {projects.map(project => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectCard({ project }: { project: any }) {
  const snap = project.brain_snapshots?.[0]
  const isBuilding = snap?.status === 'building' || snap?.status === 'pending'
  const isComplete = snap?.status === 'complete'
  const isFailed = snap?.status === 'failed'
  const staleness = snap?.staleness_score || 0
  const meta = snap?.metadata || {}

  return (
    <Link href={`/dashboard/projects/${project.id}`}>
      <div className="card p-0 overflow-hidden hover:border-border-hover transition-all duration-200 group cursor-pointer hover:-translate-y-[2px] hover:shadow-[0_8px_24px_rgba(0,0,0,0.2)]">
        {/* Mini graph header bar */}
        <div className="h-1 bg-gradient-to-r from-transparent via-accent/20 to-transparent" />

        <div className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-[15px] font-display font-medium text-text-0 group-hover:text-accent transition-colors">
                {project.name}
              </h3>
              {project.github_repo_url && (
                <div className="flex items-center gap-1.5 mt-1">
                  <GitBranch className="w-3 h-3 text-text-3" />
                  <span className="text-[11px] text-text-2 font-mono">
                    {project.github_repo_url.replace('https://github.com/', '')}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {isBuilding && (
                <span className="badge-accent">
                  <span className="status-dot bg-accent animate-pulse-slow" style={{boxShadow: '0 0 6px #10B981'}} />Building
                </span>
              )}
              {isComplete && staleness < 0.3 && (
                <span className="badge-success"><span className="status-dot bg-success" />Live</span>
              )}
              {isComplete && staleness >= 0.3 && (
                <span className="badge-warning"><span className="status-dot bg-warning" />Stale</span>
              )}
              {isFailed && <span className="badge-danger">Failed</span>}
              {!snap && <span className="badge-muted">No Brain</span>}
            </div>
          </div>

          {isComplete && (
            <>
              {meta.product_summary?.what_it_does && (
                <p className="text-xs text-text-2 leading-relaxed mb-3 line-clamp-2">
                  {meta.product_summary.what_it_does}
                </p>
              )}
              <div className="flex items-center gap-3 text-[11px] text-text-2">
                <span><strong className="text-text-1 font-medium">{meta.total_nodes || '—'}</strong> nodes</span>
                <span className="w-[3px] h-[3px] rounded-full bg-text-3" />
                <span><strong className="text-text-1 font-medium">{meta.total_edges || '—'}</strong> edges</span>
                <span className="w-[3px] h-[3px] rounded-full bg-text-3" />
                <span>v{snap.version}</span>
                {snap.built_at && <span className="ml-auto text-text-3">{new Date(snap.built_at).toLocaleDateString()}</span>}
              </div>
            </>
          )}

          {isBuilding && (
            <div className="mt-2">
              <div className="h-[3px] bg-bg-4 rounded-full overflow-hidden">
                <div className="w-full h-full bg-gradient-to-r from-transparent via-accent to-transparent animate-shimmer" />
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                <Zap className="w-3 h-3 text-accent" />
                <span className="text-[11px] text-text-2">Extracting entities \u2192 synthesizing graph...</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
