'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  Brain, LayoutDashboard, FileText, 
  Inbox, Search, Settings, LogOut,
  ChevronDown
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Projects', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/query', label: 'Query Brain', icon: Search },
  { href: '/dashboard/prd', label: 'Generate PRD', icon: FileText },
  { href: '/dashboard/intake', label: 'Intake', icon: Inbox },
]

export default function Sidebar({ user }: { user: User }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <aside className="w-52 flex-shrink-0 flex flex-col h-full bg-surface border-r border-border">
      {/* Logo */}
      <div className="px-4 h-12 flex items-center gap-2 border-b border-border">
        <div className="w-5 h-5 rounded bg-accent/20 border border-accent/30 flex items-center justify-center">
          <Brain className="w-3 h-3 text-accent" />
        </div>
        <span className="font-display text-xs tracking-widest text-foreground uppercase">Cortex</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 px-2.5 py-2 rounded text-sm transition-colors duration-100',
                active
                  ? 'bg-surface-3 text-foreground'
                  : 'text-foreground-2 hover:text-foreground hover:bg-surface-2'
              )}
            >
              <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', active ? 'text-accent' : '')} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="px-2 py-3 border-t border-border space-y-0.5">
        <Link
          href="/dashboard/settings"
          className="flex items-center gap-2.5 px-2.5 py-2 rounded text-sm text-foreground-2 hover:text-foreground hover:bg-surface-2 transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
          Settings
        </Link>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-sm text-foreground-2 hover:text-foreground hover:bg-surface-2 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>

        {/* User info */}
        <div className="mt-2 px-2.5 py-2 flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
            <span className="text-2xs text-accent font-medium">
              {user.email?.[0].toUpperCase()}
            </span>
          </div>
          <span className="text-2xs text-muted truncate">{user.email}</span>
        </div>
      </div>
    </aside>
  )
}
