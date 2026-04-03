import { NextRequest, NextResponse } from 'next/server'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { keyId: string } }
) {
  const authHeader = request.headers.get('authorization')
  const res = await fetch(`${process.env.API_URL}/api/v1/keys/${params.keyId}`, {
    method: 'DELETE',
    headers: { 'Authorization': authHeader || '' },
  })
  return NextResponse.json({}, { status: res.status })
}
