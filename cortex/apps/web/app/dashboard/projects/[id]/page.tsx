import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import BrainStatusPanel from '@/components/brain/BrainStatusPanel'
import BrainNodeList from '@/components/brain/BrainNodeList'
import BuildBrainButton from '@/components/brain/BuildBrainButton'
import { GitBranch, Clock, Brain } from 'lucide-react'
import { formatRelativeTime } from '@/lib/utils'

async function getProject(id: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('projects')
    .select(`
      *,
      brain_snapshots (
        id, version, status, trigger, trigger_ref,
        built_at, staleness_score, metadata, created_at
      )
    `)
    .eq('id', id)
    .order('created_at', { ascending: false, foreignTable: 'brain_snapshots' })
    .limit(5, { foreignTable: 'brain_snapshots' })
    .single()
  return data
}

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const project = await getProject(params.id)
  if (!project) notFound()

  const latestSnapshot = project.brain_snapshots?.[0]
  const isBuilding = latestSnapshot?.status === 'building' || latestSnapshot?.status === 'pending'
  const metadata = latestSnapshot?.metadata || {}

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-base font-medium text-foreground">{project.name}</h1>
          {project.github_repo_url && (
            <a
              href={project.github_repo_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 mt-1 text-2xs text-muted hover:text-foreground-2 transition-colors font-mono"
            >
              <GitBranch className="w-3 h-3" />
              {project.github_repo_url.replace('https://github.com/', '')}
            </a>
          )}
        </div>
        <BuildBrainButton
          projectId={project.id}
          isBuilding={isBuilding}
          hasExistingBrain={!!latestSnapshot}
        />
      </div>

      {/* Brain status */}
      <BrainStatusPanel
        snapshot={latestSnapshot}
        projectId={project.id}
      />

      {/* Stats row — only if Brain built */}
      {latestSnapshot?.status === 'complete' && (
        <div className="grid grid-cols-4 gap-3">
          {Object.entries(metadata.by_type || {}).map(([type, count]) => (
            <div key={type} className="card p-4">
              <div className={`node-${type} mb-2 w-fit`}>{type}</div>
              <div className="text-xl font-medium text-foreground">{count as number}</div>
            </div>
          ))}
        </div>
      )}

      {/* Product summary */}
      {metadata.product_summary?.what_it_does && (
        <div className="card p-5">
          <h3 className="label mb-2">Brain Summary</h3>
          <p className="text-sm text-foreground-2 leading-relaxed">
            {metadata.product_summary.what_it_does}
          </p>
          {metadata.product_summary.tech_stack?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {metadata.product_summary.tech_stack.map((t: string) => (
                <span key={t} className="badge-muted">{t}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Node list */}
      {latestSnapshot?.status === 'complete' && (
        <BrainNodeList projectId={project.id} />
      )}

      {/* Build history */}
      {project.brain_snapshots && project.brain_snapshots.length > 0 && (
        <div>
          <h3 className="label mb-3">Build history</h3>
          <div className="space-y-1.5">
            {project.brain_snapshots.map((snap: any) => (
              <div key={snap.id} className="card-2 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Brain className="w-3.5 h-3.5 text-muted" />
                  <span className="text-sm text-foreground">v{snap.version}</span>
                  <span className={`badge-${snap.status === 'complete' ? 'success' : snap.status === 'failed' ? 'danger' : snap.status === 'building' ? 'accent' : 'muted'}`}>
                    {snap.status}
                  </span>
                  <span className="text-2xs text-muted">{snap.trigger}</span>
                  {snap.trigger_ref && (
                    <span className="text-2xs text-muted font-mono">#{snap.trigger_ref}</span>
                  )}
                </div>
                {snap.built_at && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-muted" />
                    <span className="text-2xs text-foreground-2">
                      {formatRelativeTime(snap.built_at)}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
