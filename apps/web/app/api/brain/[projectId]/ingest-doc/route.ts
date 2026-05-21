import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const authHeader = request.headers.get('authorization')

  // Forward the multipart form data as-is to the backend
  const formData = await request.formData()

  const res = await fetch(`${process.env.API_URL}/api/v1/brain/${params.projectId}/ingest-doc`, {
    method: 'POST',
    headers: {
      'Authorization': authHeader || '',
    },
    body: formData,
  })

  const text = await res.text()
  try {
    return NextResponse.json(JSON.parse(text), { status: res.status })
  } catch {
    return NextResponse.json({ error: text }, { status: res.status })
  }
}
