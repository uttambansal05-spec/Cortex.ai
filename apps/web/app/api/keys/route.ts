import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const { name, project_id } = await request.json()
  const res = await fetch(
    `${process.env.API_URL}/api/v1/keys/?name=${encodeURIComponent(name)}&project_id=${project_id}`,
    { method: 'POST', headers: { 'Authorization': authHeader || '' } }
  )
  const text = await res.text()
  try { return NextResponse.json(JSON.parse(text), { status: res.status }) }
  catch { return NextResponse.json({ error: text }, { status: res.status }) }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const { searchParams } = new URL(request.url)
  const project_id = searchParams.get('project_id')
  const res = await fetch(
    `${process.env.API_URL}/api/v1/keys/?project_id=${project_id}`,
    { headers: { 'Authorization': authHeader || '' } }
  )
  const text = await res.text()
  try { return NextResponse.json(JSON.parse(text), { status: res.status }) }
  catch { return NextResponse.json({ error: text }, { status: res.status }) }
}
