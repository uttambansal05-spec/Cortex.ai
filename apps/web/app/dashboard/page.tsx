'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Plus, Brain, GitBranch, Clock, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/auth/login'); return }
      setUser(session.user)

      // Get workspace
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('id')
        .eq('owner_id', session.user.id)
        .single()

      if (!workspace) { setLoading(false); return }

      // Get projects
      const { data: projectData } = await supabase
        .from('projects')
        .select('*, brain_snapshots(id, version, status, built_at, staleness_score)')
        .eq('workspace_id', workspace.id)
        .order('created_at', { ascending: false })

      setProjects(projectData || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Brain className="w-4 h-4 text-accent animate-pulse" />
      </div>
    )
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-base font-medium text-foreground">Projects</h1>
          <p className="text-xs text-foreground-2 mt-0.5">
            {projects.length} project{projects.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link href="/dashboard/projects/new" className="btn-primary">
          <Plus className="w-3.5 h-3.5" />
          New project
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-12 h-12 rounded-lg bg-surface-2 border border-border flex items-center justify-center mb-4">
            <Brain className="w-5 h-5 text-muted" />
          </div>
          <h3 className="text-sm font-medium text-foreground mb-1">No projects yet</h3>
          <p className="text-xs text-foreground-2 mb-6 max-w-xs">
            Connect a GitHub repo to build your first Product Brain.
          </p>
          <Link href="/dashboard/projects/new" className="btn-primary">
            <Plus className="w-3.5 h-3.5" />
            Create first project
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {projects.map(project => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectCard({ project }: { project: any }) {
  const latestSnapshot = project.brain_snapshots?.[0]
  const isBuilding = latestSnapshot?.status === 'building' || latestSnapshot?.status === 'pending'
  const isComplete = latestSnapshot?.status === 'complete'
  const staleness = latestSnapshot?.staleness_score || 0

  return (
    <Link href={`/dashboard/projects/${project.id}`}>
      <div className="card p-5 hover:border-border-2 transition-colors duration-150 group cursor-pointer">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-medium text-foreground group-hover:text-accent transition-colors">
              {project.name}
            </h3>
            {project.github_repo_url && (
              <div className="flex items-center gap-1 mt-1">
                <GitBranch className="w-3 h-3 text-muted" />
                <span className="text-2xs text-muted font-mono">
                  {project.github_repo_url.replace('https://github.com/', '')}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {isBuilding && <span className="badge-accent"><span className="status-dot bg-accent animate-pulse-slow" />Building</span>}
            {isComplete && staleness < 0.3 && <span className="badge-success"><span className="status-dot bg-success" />Live</span>}
            {isComplete && staleness >= 0.3 && <span className="badge-warning"><span className="status-dot bg-warning" />Stale</span>}
            {!latestSnapshot && <span className="badge-muted">No Brain</span>}
          </div>
        </div>
        {latestSnapshot && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Brain className="w-3 h-3 text-muted" />
              <span className="text-2xs text-foreground-2">v{latestSnapshot.version}</span>
            </div>
            {latestSnapshot.built_at && (
              <div className="flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-muted" />
                <span className="text-2xs text-foreground-2">{new Date(latestSnapshot.built_at).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </Link>
  )
}
