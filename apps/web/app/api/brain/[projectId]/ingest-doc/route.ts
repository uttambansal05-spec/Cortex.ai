import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const authHeader = request.headers.get('authorization')
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ detail: 'No file provided' }, { status: 400 })
    }

    // Re-build FormData for the backend
    const backendForm = new FormData()
    backendForm.append('file', file, file.name)

    const res = await fetch(
      `${process.env.API_URL}/api/v1/brain/${params.projectId}/ingest-doc`,
      {
        method: 'POST',
        headers: {
          'Authorization': authHeader || '',
        },
        body: backendForm,
      }
    )

    const text = await res.text()
    try {
      return NextResponse.json(JSON.parse(text), { status: res.status })
    } catch {
      return NextResponse.json({ error: text }, { status: res.status })
    }
  } catch (e: any) {
    console.error('ingest-doc proxy error:', e)
    return NextResponse.json({ detail: e.message || 'Proxy error' }, { status: 500 })
  }
}
