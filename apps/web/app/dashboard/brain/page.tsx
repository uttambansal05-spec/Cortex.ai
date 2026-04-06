'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { GitGraph, X, FileCode, AlertTriangle, Loader2 } from 'lucide-react'

const COLORS: Record<string, string> = {
  entity: '#7F77DD', risk: '#E24B4A', gap: '#EF9F27',
  decision: '#1D9E75', flow: '#639922', dependency: '#888780',
  model: '#378ADD', api: '#D4537E',
}

const TYPE_LABELS: Record<string, string> = {
  entity: 'Entity', risk: 'Risk', gap: 'Gap',
  decision: 'Decision', flow: 'Flow', dependency: 'Dependency',
  model: 'Model', api: 'API',
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

interface SimLink { source: SimNode; target: SimNode; edge_type: string }
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
      .map(e => ({ source: nodeById.get(e.from_node)!, target: nodeById.get(e.to_node)!, edge_type: e.edge_type }))

    svg.attr('width', w).attr('height', h)
    const g = svg.append('g')
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 6])
      .on('zoom', e => g.attr('transform', e.transform))
    svg.call(zoom)

    const sim = d3.forceSimulation<SimNode>(simNodes)
      .force('link', d3.forceLink<SimNode, SimLink>(simLinks).id(d => d.id).distance(90).strength(0.35))
      .force('charge', d3.forceManyBody().strength(-250))
      .force('center', d3.forceCenter(w / 2, h / 2))
      .force('collide', d3.forceCollide<SimNode>(22))
    simulationRef.current = sim

    const link = g.append('g')
      .selectAll<SVGLineElement, SimLink>('line').data(simLinks).join('line')
      .attr('stroke', d => COLORS[d.source.node_type] || '#888')
      .attr('stroke-opacity', 0.4).attr('stroke-width', 1.5)

    const drag = d3.drag<SVGGElement, SimNode>()
      .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y })
      .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null })

    const node = g.append('g')
      .selectAll<SVGGElement, SimNode>('g').data(simNodes).join('g')
      .style('cursor', 'pointer').call(drag)
      .on('click', (_e, d) => setSelectedNode({ ...d, connections: degree[d.id] || 0 }))
      .on('mouseover', (_e, d) => {
        link.attr('stroke-opacity', (l: SimLink) =>
          l.source.id === d.id || l.target.id === d.id ? 0.85 : 0.04)
        node.selectAll<SVGCircleElement, SimNode>('circle').attr('opacity', (n: SimNode) => {
          if (n.id === d.id) return 1
          const connected = filteredEdges.some(e =>
            (e.from_node === d.id && e.to_node === n.id) || (e.to_node === d.id && e.from_node === n.id))
          return connected ? 1 : 0.15
        })
      })
      .on('mouseout', () => { link.attr('stroke-opacity', 0.2); node.selectAll('circle').attr('opacity', 1) })

    node.append('circle')
      .attr('r', d => Math.max(5, 5 + (degree[d.id] || 0) * 0.8))
      .attr('fill', d => COLORS[d.node_type] || '#888')
      .attr('fill-opacity', 0.8)
      .attr('stroke', d => COLORS[d.node_type] || '#888')
      .attr('stroke-width', 1.5).attr('stroke-opacity', 0.35)

    node.append('text')
      .text(d => d.label.length > 16 ? d.label.slice(0, 15) + '…' : d.label)
      .attr('dy', d => -(Math.max(5, 5 + (degree[d.id] || 0) * 0.8)) - 5)
      .attr('text-anchor', 'middle').attr('font-size', '10px')
      .attr('fill', '#9a9890').attr('pointer-events', 'none')

    sim.on('tick', () => {
      link.attr('x1', d => d.source.x ?? 0).attr('y1', d => d.source.y ?? 0)
        .attr('x2', d => d.target.x ?? 0).attr('y2', d => d.target.y ?? 0)
      node.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })
  }

  const nodeTypes = ['all', ...Array.from(new Set(nodes.map(n => n.node_type)))]
  const typeCounts = nodes.reduce((acc, n) => ({ ...acc, [n.node_type]: (acc[n.node_type] || 0) + 1 }), {} as Record<string, number>)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f0f13' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: '#17171e', borderBottom: '0.5px solid #2e2e3a', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <GitGraph style={{ width: 14, height: 14, color: '#7F77DD' }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: '#e8e6df' }}>Brain Map</span>
          {nodes.length > 0 && <span style={{ fontSize: 11, color: '#888780' }}>{nodes.length} nodes · {edges.length} edges</span>}
        </div>
        {projects.length > 1 && (
          <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)}
            style={{ fontSize: 12, padding: '4px 8px', background: '#1e1e2a', border: '0.5px solid #2e2e3a', borderRadius: 6, color: '#e8e6df' }}>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      {nodes.length > 0 && (
        <div style={{ display: 'flex', gap: 6, padding: '8px 16px', background: '#17171e', borderBottom: '0.5px solid #2e2e3a', flexShrink: 0, flexWrap: 'wrap' }}>
          {nodeTypes.map(type => (
            <button key={type} onClick={() => setActiveFilter(type)} style={{
              padding: '3px 10px', borderRadius: 999, fontSize: 11, cursor: 'pointer',
              background: activeFilter === type ? '#1e1e2a' : 'transparent',
              border: `0.5px solid ${activeFilter === type ? '#534AB7' : '#2e2e3a'}`,
              color: activeFilter === type ? '#e8e6df' : '#888780',
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              {type === 'all' ? `All (${nodes.length})` : `${type} (${typeCounts[type] || 0})`}
            </button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
            <Loader2 style={{ width: 20, height: 20, color: '#7F77DD' }} className="animate-spin" />
            <span style={{ fontSize: 12, color: '#888780' }}>Loading brain graph…</span>
          </div>
        ) : nodes.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
            <GitGraph style={{ width: 32, height: 32, color: '#2e2e3a' }} />
            <span style={{ fontSize: 13, color: '#888780' }}>No brain built yet</span>
            <span style={{ fontSize: 11, color: '#534841' }}>Build the brain from the project page first</span>
          </div>
        ) : (
          <svg ref={svgRef} style={{ flex: 1, width: '100%', height: '100%' }} />
        )}

        {nodes.length > 0 && (
          <div style={{ position: 'absolute', bottom: 20, left: 20, background: '#17171e', border: '0.5px solid #2e2e3a', borderRadius: 10, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Object.entries(COLORS).filter(([type]) => typeCounts[type] > 0).map(([type, color]) => (
              <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#888780' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                {TYPE_LABELS[type] || type}
              </div>
            ))}
          </div>
        )}

        {nodes.length > 0 && (
          <div style={{ position: 'absolute', bottom: 20, right: selectedNode ? 276 : 16, fontSize: 10, color: '#444441' }}>
            scroll to zoom · drag to pan · click node for details
          </div>
        )}

        {selectedNode && (
          <div style={{ width: 256, background: '#17171e', borderLeft: '0.5px solid #2e2e3a', padding: 20, overflowY: 'auto', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[selectedNode.node_type] || '#888', flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: COLORS[selectedNode.node_type], textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {TYPE_LABELS[selectedNode.node_type] || selectedNode.node_type}
                </span>
              </div>
              <button onClick={() => setSelectedNode(null)} style={{ background: 'none', border: 'none', color: '#888780', cursor: 'pointer', padding: 0 }}>
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#e8e6df', marginBottom: 10, lineHeight: 1.4 }}>{selectedNode.label}</p>
            {selectedNode.summary && (
              <p style={{ fontSize: 11, color: '#888780', lineHeight: 1.6, marginBottom: 12 }}>{selectedNode.summary}</p>
            )}
            {selectedNode.source_file && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <FileCode style={{ width: 11, height: 11, color: '#534AB7', flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: '#534AB7', fontFamily: 'monospace' }}>{selectedNode.source_file}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ background: '#1e1e2a', borderRadius: 6, padding: '6px 10px', flex: 1 }}>
                <div style={{ fontSize: 10, color: '#888780', marginBottom: 2 }}>connections</div>
                <div style={{ fontSize: 16, fontWeight: 500, color: '#e8e6df' }}>{selectedNode.connections}</div>
              </div>
              {selectedNode.node_type === 'risk' && (
                <div style={{ background: 'rgba(226,75,74,0.1)', borderRadius: 6, padding: '6px 10px', flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertTriangle style={{ width: 10, height: 10, color: '#E24B4A' }} />
                  <span style={{ fontSize: 10, color: '#E24B4A' }}>Risk</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
