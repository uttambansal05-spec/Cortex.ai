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
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="flex items-center gap-2">
        <Brain className="w-4 h-4 text-accent animate-pulse" />
        <span className="text-sm text-foreground-2">Signing you in...</span>
      </div>
      <Suspense>
        <CallbackHandler />
      </Suspense>
    </div>
  )
}