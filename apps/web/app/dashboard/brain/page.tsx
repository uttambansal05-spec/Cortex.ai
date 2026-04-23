'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { GitGraph, X, FileCode, AlertTriangle, Loader2, Brain, Maximize2 } from 'lucide-react'

const COLORS: Record<string, string> = {
  entity: '#818CF8', risk: '#F87171', gap: '#FBBF24',
  decision: '#34D399', flow: '#22D3EE', dependency: '#64748B',
  model: '#60A5FA', api: '#F472B6', config: '#A78BFA',
}

const GLOW: Record<string, string> = {
  entity: 'rgba(129,140,248,0.4)', risk: 'rgba(248,113,113,0.4)', gap: 'rgba(251,191,36,0.4)',
  decision: 'rgba(52,211,153,0.4)', flow: 'rgba(34,211,238,0.4)', dependency: 'rgba(100,116,139,0.25)',
  model: 'rgba(96,165,250,0.4)', api: 'rgba(244,114,182,0.4)', config: 'rgba(167,139,250,0.4)',
}

const TYPE_LABELS: Record<string, string> = {
  entity: 'Entity', risk: 'Risk', gap: 'Gap',
  decision: 'Decision', flow: 'Flow', dependency: 'Dependency',
  model: 'Model', api: 'API', config: 'Config',
}

interface BrainNode {
  id: string; label: string; node_type: string
  summary?: string; source_file?: string; metadata?: any
}

interface BrainEdge {
  id: string; from_node: string; to_node: string
  edge_type: string; weight: number
}

interface SimNode extends BrainNode {
  x?: number; y?: number; vx?: number; vy?: number
  fx?: number | null; fy?: number | null; index?: number
}

interface SimLink { source: SimNode; target: SimNode; edge_type: string; weight: number }
interface SelectedNode extends BrainNode { connections: number }

export default function BrainMapPage() {
  const [projects, setProjects] = useState<any[]>([])
  const [selectedProject, setSelectedProject] = useState('')
  const [nodes, setNodes] = useState<BrainNode[]>([])
  const [edges, setEdges] = useState<BrainEdge[]>([])
  const [loading, setLoading] = useState(false)
  const [activeFilter, setActiveFilter] = useState('all')
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const simulationRef = useRef<any>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/auth/login'); return }
      const { data: workspace } = await supabase
        .from('workspaces').select('id').eq('owner_id', session.user.id).single()
      if (!workspace) return
      const { data: projs } = await supabase
        .from('projects').select('id, name').eq('workspace_id', workspace.id)
      if (projs?.length) {
        setProjects(projs)
        const projectParam = searchParams.get('project')
        const match = projectParam && projs.find((p: any) => p.id === projectParam)
        setSelectedProject(match ? match.id : projs[0].id)
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (!selectedProject) return
    fetchGraph(selectedProject)
  }, [selectedProject])

  const fetchGraph = async (projectId: string) => {
    setLoading(true)
    setSelectedNode(null)
    try {
      const { data: snapshot } = await supabase
        .from('brain_snapshots')
        .select('id')
        .eq('project_id', projectId)
        .eq('status', 'complete')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!snapshot) { setNodes([]); setEdges([]); return }

      const [{ data: nodesData }, { data: edgesData }] = await Promise.all([
        supabase.from('brain_nodes')
          .select('id, label, node_type, summary, source_file')
          .eq('project_id', projectId),
        supabase.from('brain_edges')
          .select('id, from_node, to_node, edge_type, weight')
          .eq('project_id', projectId),
      ])
      setNodes(nodesData || [])
      setEdges(edgesData || [])
    } catch {
      setNodes([]); setEdges([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!nodes.length || !svgRef.current) return
    renderGraph()
    return () => { simulationRef.current?.stop() }
  }, [nodes, edges, activeFilter])

  const renderGraph = async () => {
    const d3 = await import('d3')
    const svg = d3.select(svgRef.current!)
    svg.selectAll('*').remove()
    const w = svgRef.current!.clientWidth || 800
    const h = svgRef.current!.clientHeight || 600

    const filteredNodes: BrainNode[] = activeFilter === 'all'
      ? nodes : nodes.filter(n => n.node_type === activeFilter)
    const filteredNodeIds = new Set(filteredNodes.map(n => n.id))
    const filteredEdges = edges.filter(e =>
      filteredNodeIds.has(e.from_node) && filteredNodeIds.has(e.to_node))

    const degree: Record<string, number> = {}
    filteredEdges.forEach(e => {
      degree[e.from_node] = (degree[e.from_node] || 0) + 1
      degree[e.to_node] = (degree[e.to_node] || 0) + 1
    })

    const simNodes: SimNode[] = filteredNodes.map(n => ({ ...n }))
    const nodeById = new Map<string, SimNode>(simNodes.map(n => [n.id, n]))
    const simLinks: SimLink[] = filteredEdges
      .filter(e => nodeById.has(e.from_node) && nodeById.has(e.to_node))
      .map(e => ({ source: nodeById.get(e.from_node)!, target: nodeById.get(e.to_node)!, edge_type: e.edge_type, weight: e.weight || 1 }))

    svg.attr('width', w).attr('height', h)

    const defs = svg.append('defs')

    Object.entries(COLORS).forEach(([type, color]) => {
      const filter = defs.append('filter')
        .attr('id', `glow-${type}`)
        .attr('x', '-100%').attr('y', '-100%')
        .attr('width', '300%').attr('height', '300%')
      filter.append('feGaussianBlur')
        .attr('stdDeviation', '4')
        .attr('result', 'blur')
      filter.append('feFlood')
        .attr('flood-color', color)
        .attr('flood-opacity', '0.6')
        .attr('result', 'color')
      filter.append('feComposite')
        .attr('in', 'color').attr('in2', 'blur')
        .attr('operator', 'in').attr('result', 'glow')
      const merge = filter.append('feMerge')
      merge.append('feMergeNode').attr('in', 'glow')
      merge.append('feMergeNode').attr('in', 'SourceGraphic')
    })

    const bgGrad = defs.append('radialGradient')
      .attr('id', 'bg-gradient')
      .attr('cx', '50%').attr('cy', '50%').attr('r', '60%')
    bgGrad.append('stop').attr('offset', '0%').attr('stop-color', '#10B981').attr('stop-opacity', '0.03')
    bgGrad.append('stop').attr('offset', '100%').attr('stop-color', '#0F1114').attr('stop-opacity', '0')

    svg.append('rect').attr('width', w).attr('height', h).attr('fill', '#0F1114')
    svg.append('rect').attr('width', w).attr('height', h).attr('fill', 'url(#bg-gradient)')

    const g = svg.append('g')
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on('zoom', e => g.attr('transform', e.transform))
    svg.call(zoom)

    const sim = d3.forceSimulation<SimNode>(simNodes)
      .force('link', d3.forceLink<SimNode, SimLink>(simLinks).id(d => d.id).distance(80).strength(0.4))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(w / 2, h / 2))
      .force('collide', d3.forceCollide<SimNode>(d => Math.max(8, 6 + (degree[d.id] || 0) * 0.6) + 4))
    simulationRef.current = sim

    const link = g.append('g')
      .selectAll<SVGLineElement, SimLink>('line').data(simLinks).join('line')
      .attr('stroke', d => COLORS[d.source.node_type] || '#64748B')
      .attr('stroke-opacity', d => d.edge_type === 'co_community' ? 0.06 : 0.15)
      .attr('stroke-width', d => d.edge_type === 'co_community' ? 0.5 : 1)

    const drag = d3.drag<SVGGElement, SimNode>()
      .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y })
      .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null })

    const node = g.append('g')
      .selectAll<SVGGElement, SimNode>('g').data(simNodes).join('g')
      .style('cursor', 'pointer').call(drag)
      .on('click', (_e, d) => setSelectedNode({ ...d, connections: degree[d.id] || 0 }))
      .on('mouseover', (_e, d) => {
        link.attr('stroke-opacity', (l: SimLink) => {
          if (l.source.id === d.id || l.target.id === d.id) return 0.7
          return 0.03
        }).attr('stroke-width', (l: SimLink) => {
          if (l.source.id === d.id || l.target.id === d.id) return 2
          return l.edge_type === 'co_community' ? 0.5 : 1
        })
        node.selectAll<SVGCircleElement, SimNode>('.node-circle').attr('opacity', (n: SimNode) => {
          if (n.id === d.id) return 1
          const connected = filteredEdges.some(e =>
            (e.from_node === d.id && e.to_node === n.id) || (e.to_node === d.id && e.from_node === n.id))
          return connected ? 1 : 0.12
        })
        node.selectAll<SVGCircleElement, SimNode>('.node-glow').attr('opacity', (n: SimNode) =>
          n.id === d.id ? 0.8 : 0
        )
        node.selectAll<SVGTextElement, SimNode>('text').attr('opacity', (n: SimNode) => {
          if (n.id === d.id) return 1
          const connected = filteredEdges.some(e =>
            (e.from_node === d.id && e.to_node === n.id) || (e.to_node === d.id && e.from_node === n.id))
          return connected ? 0.8 : 0
        })
      })
      .on('mouseout', () => {
        link.attr('stroke-opacity', (d: SimLink) => d.edge_type === 'co_community' ? 0.06 : 0.15)
          .attr('stroke-width', (d: SimLink) => d.edge_type === 'co_community' ? 0.5 : 1)
        node.selectAll('.node-circle').attr('opacity', 1)
        node.selectAll('.node-glow').attr('opacity', 0)
        node.selectAll<SVGTextElement, SimNode>('text').attr('opacity', (d: SimNode) =>
          (degree[d.id] || 0) >= 4 ? 0.7 : 0
        )
      })

    node.append('circle')
      .attr('class', 'node-glow')
      .attr('r', d => Math.max(8, 6 + (degree[d.id] || 0) * 0.6) + 8)
      .attr('fill', d => GLOW[d.node_type] || 'rgba(100,116,139,0.2)')
      .attr('opacity', 0)

    node.append('circle')
      .attr('class', 'node-circle')
      .attr('r', d => Math.max(4, 4 + (degree[d.id] || 0) * 0.5))
      .attr('fill', d => COLORS[d.node_type] || '#64748B')
      .attr('filter', d => `url(#glow-${d.node_type})`)

    node.filter(d => (degree[d.id] || 0) >= 5)
      .append('circle')
      .attr('r', 1.5)
      .attr('fill', '#fff')
      .attr('opacity', 0.7)

    node.append('text')
      .text(d => d.label.length > 20 ? d.label.slice(0, 19) + '\u2026' : d.label)
      .attr('dy', d => -(Math.max(4, 4 + (degree[d.id] || 0) * 0.5)) - 6)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('font-family', "'DM Sans', sans-serif")
      .attr('fill', d => COLORS[d.node_type] || '#94A3B8')
      .attr('opacity', d => (degree[d.id] || 0) >= 4 ? 0.7 : 0)
      .attr('pointer-events', 'none')

    sim.on('tick', () => {
      link.attr('x1', d => d.source.x ?? 0).attr('y1', d => d.source.y ?? 0)
        .attr('x2', d => d.target.x ?? 0).attr('y2', d => d.target.y ?? 0)
      node.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })
  }

  const nodeTypes = ['all', ...Array.from(new Set(nodes.map(n => n.node_type)))]
  const typeCounts = nodes.reduce((acc, n) => ({ ...acc, [n.node_type]: (acc[n.node_type] || 0) + 1 }), {} as Record<string, number>)

  return (
    <div className="flex flex-col h-screen bg-bg-0">
      <div className="flex items-center justify-between px-5 py-3 bg-bg-1 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="relative text-accent">
            <Brain className="w-4 h-4" />
            {nodes.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_6px_#10B981]" />
            )}
          </div>
          <span className="text-sm font-display font-medium text-text-0">Brain Map</span>
          {nodes.length > 0 && (
            <span className="text-[11px] text-text-2 bg-bg-3 px-2 py-0.5 rounded-md">
              {nodes.length} nodes &middot; {edges.length} edges
            </span>
          )}
        </div>
        {projects.length > 1 && (
          <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)}
            className="text-xs px-2.5 py-1.5 bg-bg-3 border border-border rounded-lg text-text-0 outline-none font-sans">
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      {nodes.length > 0 && (
        <div className="flex gap-1.5 px-5 py-2.5 bg-bg-1 border-b border-border flex-shrink-0 flex-wrap">
          {nodeTypes.map(type => {
            const isActive = activeFilter === type
            const color = type === 'all' ? '#10B981' : (COLORS[type] || '#64748B')
            return (
              <button key={type} onClick={() => setActiveFilter(type)}
                className="transition-all duration-150"
                style={{
                  padding: '4px 12px', borderRadius: 999, fontSize: 11, cursor: 'pointer',
                  background: isActive ? `${color}15` : 'transparent',
                  border: `1px solid ${isActive ? `${color}40` : 'rgba(148,163,184,0.08)'}`,
                  color: isActive ? color : '#64748B',
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: isActive ? 500 : 400,
                }}>
                {type === 'all' ? `All (${nodes.length})` : `${type} (${typeCounts[type] || 0})`}
              </button>
            )
          })}
        </div>
      )}

      <div className="flex-1 flex relative overflow-hidden">
        {loading ? (
          <div className="flex-1 flex items-center justify-center flex-col gap-3">
            <div className="w-12 h-12 rounded-2xl bg-accent-muted border border-accent-border flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-accent animate-spin" />
            </div>
            <span className="text-xs text-text-2 font-display">Loading brain graph&hellip;</span>
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex-1 flex items-center justify-center flex-col gap-3">
            <div className="w-14 h-14 rounded-2xl bg-bg-2 border border-border flex items-center justify-center">
              <Brain className="w-6 h-6 text-text-3" />
            </div>
            <span className="text-sm text-text-1 font-display">No brain built yet</span>
            <span className="text-xs text-text-2">Build the brain from the project page first</span>
          </div>
        ) : (
          <svg ref={svgRef} className="flex-1 w-full h-full" />
        )}

        {nodes.length > 0 && (
          <div className="absolute bottom-5 left-5 bg-bg-1/90 backdrop-blur-md border border-border rounded-xl p-3 flex flex-col gap-1.5">
            {Object.entries(COLORS).filter(([type]) => typeCounts[type] > 0).map(([type, color]) => (
              <div key={type} className="flex items-center gap-2.5 text-[11px] text-text-2 font-sans">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color, boxShadow: `0 0 6px ${color}40` }} />
                <span>{TYPE_LABELS[type] || type}</span>
                <span className="text-text-3 ml-auto">{typeCounts[type]}</span>
              </div>
            ))}
          </div>
        )}

        {nodes.length > 0 && (
          <div className="absolute bottom-5 text-[10px] text-text-3 font-sans"
            style={{ right: selectedNode ? 290 : 20 }}>
            scroll to zoom &middot; drag to pan &middot; click node for details
          </div>
        )}

        {selectedNode && (
          <div className="w-[280px] bg-bg-1 border-l border-border p-5 overflow-y-auto flex-shrink-0 animate-fade-in">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{
                  background: COLORS[selectedNode.node_type] || '#64748B',
                  boxShadow: `0 0 8px ${GLOW[selectedNode.node_type] || 'rgba(100,116,139,0.3)'}`,
                }} />
                <span className="text-[10px] font-medium uppercase tracking-[0.08em] font-sans"
                  style={{ color: COLORS[selectedNode.node_type] }}>
                  {TYPE_LABELS[selectedNode.node_type] || selectedNode.node_type}
                </span>
              </div>
              <button onClick={() => setSelectedNode(null)}
                className="text-text-2 hover:text-text-0 transition-colors p-0.5 rounded hover:bg-bg-3">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-[14px] font-display font-medium text-text-0 mb-2.5 leading-snug">
              {selectedNode.label}
            </p>

            {selectedNode.summary && (
              <p className="text-[12px] text-text-1 leading-relaxed mb-3 font-sans">
                {selectedNode.summary}
              </p>
            )}

            {selectedNode.source_file && (
              <div className="flex items-center gap-2 mb-4 px-2.5 py-1.5 bg-bg-3 rounded-lg">
                <FileCode className="w-3 h-3 text-accent flex-shrink-0" />
                <span className="text-[10px] text-accent font-mono truncate">
                  {selectedNode.source_file}
                </span>
              </div>
            )}

            <div className="flex gap-2">
              <div className="bg-bg-3 rounded-lg p-3 flex-1">
                <div className="text-[10px] text-text-2 mb-0.5 font-sans">connections</div>
                <div className="text-lg font-display font-semibold text-text-0">{selectedNode.connections}</div>
              </div>
              {selectedNode.node_type === 'risk' && (
                <div className="bg-danger/10 rounded-lg p-3 flex-1 flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-danger" />
                  <span className="text-[11px] text-danger font-medium font-sans">Risk</span>
                </div>
              )}
              {selectedNode.node_type === 'gap' && (
                <div className="bg-warning/10 rounded-lg p-3 flex-1 flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                  <span className="text-[11px] text-warning font-medium font-sans">Gap</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
