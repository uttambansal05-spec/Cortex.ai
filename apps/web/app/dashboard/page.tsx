'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Plus, Brain } from 'lucide-react'
import Link from 'next/link'

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/auth/login')
      } else {
        setUser(session.user)
        setLoading(false)
      }
    })

    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setUser(session.user)
        setLoading(false)
      }
      if (event === 'SIGNED_OUT') {
        router.push('/auth/login')
      }
    })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-accent animate-pulse" />
          <span className="text-sm text-foreground-2">Loading...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-base font-medium text-foreground">Projects</h1>
          <p className="text-xs text-foreground-2 mt-0.5">{user?.email}</p>
        </div>
        <Link href="/dashboard/projects/new" className="btn-primary">
          <Plus className="w-3.5 h-3.5" />
          New project
        </Link>
      </div>

      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-12 h-12 rounded-lg bg-surface-2 border border-border flex items-center justify-center mb-4">
          <Brain className="w-5 h-5 text-muted" />
        </div>
        <h3 className="text-sm font-medium text-foreground mb-1">No projects yet</h3>
        <p className="text-xs text-foreground-2 mb-6 max-w-xs">
          Connect a GitHub repo to build your first Product Brain.
        </p>
        <Link href="/dashboard/projects/new" className="btn-primary">
          <Plus className="w-3.5 h-3.5" />
          Create first project
        </Link>
      </div>
    </div>
  )
}