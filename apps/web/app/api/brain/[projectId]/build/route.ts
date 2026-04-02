import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const authHeader = request.headers.get('authorization')
  const body = await request.json()
  const res = await fetch(`${process.env.API_URL}/api/v1/brain/${params.projectId}/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': authHeader || '' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  try { return NextResponse.json(JSON.parse(text), { status: res.status }) }
  catch { return NextResponse.json({ error: text }, { status: res.status }) }
}
