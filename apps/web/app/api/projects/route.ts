import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const body = await request.json()

  console.log('Auth header:', authHeader?.substring(0, 20))

  if (!authHeader) {
    return NextResponse.json({ error: 'No auth header' }, { status: 401 })
  }

  const res = await fetch(`${process.env.API_URL}/api/v1/projects/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
    },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  console.log('Backend response:', text.substring(0, 200))

  try {
    const data = JSON.parse(text)
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: text }, { status: res.status })
  }
}