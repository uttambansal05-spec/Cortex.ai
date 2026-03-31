import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url)
  // Just redirect to dashboard — implicit flow token is in hash
  // Client-side Supabase will pick it up automatically
  return NextResponse.redirect(`${origin}/dashboard`)
}