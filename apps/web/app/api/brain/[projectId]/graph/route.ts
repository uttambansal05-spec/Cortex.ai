import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const { projectId } = params

  const [snapshotRes, nodesRes, edgesRes] = await Promise.all([
    supabase
      .from('brain_snapshots')
      .select('id, version, built_at, metadata')
      .eq('project_id', projectId)
      .eq('status', 'complete')
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from('brain_nodes')
      .select('id, label, node_type, summary, source_file, metadata')
      .eq('project_id', projectId),
    supabase
      .from('brain_edges')
      .select('id, from_node, to_node, edge_type, weight')
      .eq('project_id', projectId),
  ])

  if (snapshotRes.error) {
    return NextResponse.json({ error: 'No complete brain found' }, { status: 404 })
  }

  return NextResponse.json({
    snapshot: snapshotRes.data,
    nodes: nodesRes.data || [],
    edges: edgesRes.data || [],
  })
}
