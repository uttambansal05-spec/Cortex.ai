'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Brain } from 'lucide-react'

export default function AuthCallbackPage() {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        router.push('/dashboard')
      }
    })
  }, [])

  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="flex items-center gap-2">
        <Brain className="w-4 h-4 text-accent animate-pulse" />
        <span className="text-sm text-foreground-2">Signing you in...</span>
      </div>
    </div>
  )
}