import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus, Brain, GitBranch, Clock, AlertTriangle } from 'lucide-react'

async function getProjects(userId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('projects')
    .select(`
      *,
      brain_snapshots (
        id, version, status, built_at, staleness_score,
        created_at
      )
    `)
    .eq('workspace_id', userId) // simplified - real impl uses workspace
    .order('created_at', { ascending: false })
    .limit(10)

  return data || []
}

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const projects = await getProjects(user!.id)

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-base font-medium text-foreground">Projects</h1>
          <p className="text-xs text-foreground-2 mt-0.5">
            {projects.length} project{projects.length !== 1 ? 's' : ''} · 
            {' '}{projects.filter(p => p.brain_snapshots?.length > 0).length} with active Brain
          </p>
        </div>
        <Link href="/dashboard/projects/new" className="btn-primary">
          <Plus className="w-3.5 h-3.5" />
          New project
        </Link>
      </div>

      {/* Projects grid */}
      {projects.length === 0 ? (
        <EmptyState />
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
  const isBuilding = latestSnapshot?.status === 'building'
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

          {/* Brain status */}
          <div className="flex items-center gap-1.5">
            {isBuilding && (
              <span className="badge-accent">
                <span className="status-dot bg-accent animate-pulse-slow" />
                Building
              </span>
            )}
            {isComplete && staleness < 0.3 && (
              <span className="badge-success">
                <span className="status-dot bg-success" />
                Live
              </span>
            )}
            {isComplete && staleness >= 0.3 && (
              <span className="badge-warning">
                <span className="status-dot bg-warning" />
                Stale
              </span>
            )}
            {!latestSnapshot && (
              <span className="badge-muted">No Brain</span>
            )}
          </div>
        </div>

        {/* Stats row */}
        {latestSnapshot && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Brain className="w-3 h-3 text-muted" />
              <span className="text-2xs text-foreground-2">v{latestSnapshot.version}</span>
            </div>
            {latestSnapshot.built_at && (
              <div className="flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-muted" />
                <span className="text-2xs text-foreground-2">
                  {new Date(latestSnapshot.built_at).toLocaleDateString()}
                </span>
              </div>
            )}
            {staleness >= 0.3 && (
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3 text-warning" />
                <span className="text-2xs text-warning">
                  {Math.round(staleness * 100)}% stale
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </Link>
  )
}

function EmptyState() {
  return (
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
  )
}
