'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Brain, LayoutDashboard, Search, GitGraph, FileText, Inbox, Settings, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/dashboard', label: 'Projects', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/query', label: 'Query Brain', icon: Search, shortcut: '\u2318K' },
  { href: '/dashboard/brain', label: 'Brain Map', icon: GitGraph },
  { href: '/dashboard/prd', label: 'Generate PRD', icon: FileText },
  { href: '/dashboard/intake', label: 'Intake', icon: Inbox },
]

export default function Sidebar({ user }: { user: any }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <aside className="w-[228px] flex-shrink-0 flex flex-col h-full bg-bg-1 border-r border-border">
      {/* Logo */}
      <div className="px-5 h-14 flex items-center gap-2.5 border-b border-border">
        <div className="w-7 h-7 rounded-lg bg-accent-muted border border-accent-border flex items-center justify-center">
          <Brain className="w-3.5 h-3.5 text-accent" />
        </div>
        <span className="font-display text-sm font-semibold tracking-[0.1em] text-text-0 uppercase">Cortex</span>
        <span className="ml-auto text-[9px] font-semibold text-accent bg-accent-muted px-1.5 py-0.5 rounded tracking-wide">BETA</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5 py-3.5 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon, exact, shortcut }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link key={href} href={href} className={cn(
              'flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all duration-150',
              active
                ? 'bg-accent/[0.06] text-text-0 font-medium border-l-2 border-accent -ml-[2px] pl-[14px]'
                : 'text-text-1 hover:text-text-0 hover:bg-bg-3'
            )}>
              <Icon className={cn('w-[15px] h-[15px] flex-shrink-0', active && 'text-accent')} />
              {label}
              {shortcut && (
                <span className="ml-auto text-[9px] text-text-3 font-mono bg-bg-3 px-1 py-0.5 rounded">{shortcut}</span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="px-2.5 py-3 border-t border-border space-y-0.5">
        <Link href="/dashboard/settings" className={cn(
          'flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all duration-150',
          pathname === '/dashboard/settings' ? 'bg-bg-3 text-text-0' : 'text-text-2 hover:text-text-0 hover:bg-bg-3'
        )}>
          <Settings className="w-[15px] h-[15px]" /> Settings
        </Link>
        <button onClick={handleSignOut} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-text-3 hover:text-text-1 hover:bg-bg-3 transition-all duration-150">
          <LogOut className="w-[15px] h-[15px]" /> Sign out
        </button>
        <div className="mt-2 mx-1 px-3 py-2 flex items-center gap-2.5 bg-bg-2 rounded-lg">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-accent to-info flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] font-bold text-white font-display">{user?.email?.[0]?.toUpperCase()}</span>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-text-0 font-medium truncate">{user?.email?.split('@')[0]}</p>
            <p className="text-[10px] text-text-2 truncate">{user?.email}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
