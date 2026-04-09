'use client'

import { Suspense, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Brain } from 'lucide-react'

function CallbackHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    const code = searchParams.get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (!error) {
          router.push('/dashboard')
        } else {
          router.push('/auth/login?error=auth_failed')
        }
      })
    }
  }, [])

  return null
}

export default function AuthCallbackPage() {
  return (
    <div className="flex items-center justify-center h-screen bg-bg-0">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent-muted border border-accent-border flex items-center justify-center">
          <Brain className="w-4 h-4 text-accent animate-pulse" />
        </div>
        <span className="text-xs text-text-2 font-display">Signing you in...</span>
      </div>
      <Suspense><CallbackHandler /></Suspense>
    </div>
  )
}
