'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Brain, Send, Loader2, AlertTriangle, FileCode } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: Array<{ label: string; type: string; source_file?: string }>
  staleness_warning?: string
}

const SUGGESTED = [
  "What does this product do?",
  "What are the biggest risks in this codebase?",
  "What are the main user flows?",
  "What architectural decisions were made?",
  "What's missing or undocumented?",
  "How is state managed?",
]

export default function QueryPage() {
  const [projects, setProjects] = useState<any[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [session, setSession] = useState<any>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/auth/login'); return }
      setSession(session)

      const { data: workspace } = await supabase
        .from('workspaces').select('id').eq('owner_id', session.user.id).single()
      if (!workspace) return

      const { data: projs } = await supabase
        .from('projects').select('id, name').eq('workspace_id', workspace.id)
      if (projs?.length) {
        setProjects(projs)
        const projectParam = searchParams.get('project')
        const match = projectParam && projs.find(p => p.id === projectParam)
        setSelectedProject(match ? match.id : projs[0].id)
      }
    }
    load()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (question?: string) => {
    const q = question || input.trim()
    if (!q || !selectedProject || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: q }])
    setLoading(true)
    try {
      const res = await fetch('/api/agents/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ project_id: selectedProject, question: q }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.detail || data.error || 'Something went wrong.' }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.answer, sources: data.source_nodes, staleness_warning: data.staleness_warning }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Failed to reach the Brain.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="flex items-center justify-between px-8 py-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <Brain className="w-4 h-4 text-accent" />
          <h1 className="text-sm font-medium text-foreground">Query Brain</h1>
        </div>
        {projects.length > 1 && (
          <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} className="input w-48 text-xs">
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
        {messages.length === 0 ? (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-4">
                <Brain className="w-5 h-5 text-accent" />
              </div>
              <h2 className="text-sm font-medium text-foreground mb-1">Ask the Brain</h2>
              <p className="text-xs text-foreground-2">Ask anything about your codebase. The Brain answers from your knowledge graph.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SUGGESTED.map(q => (
                <button key={q} onClick={() => handleSend(q)} className="card p-3 text-left text-xs text-foreground-2 hover:text-foreground hover:border-border-2 transition-colors">
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-6">
            {messages.map((msg, i) => (
              <div key={i} className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className="max-w-[85%]">
                  {msg.role === 'user' ? (
                    <div className="bg-accent/10 border border-accent/20 rounded-lg px-4 py-3">
                      <p className="text-sm text-foreground">{msg.content}</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {msg.staleness_warning && (
                        <div className="flex items-center gap-2 text-xs text-warning">
                          <AlertTriangle className="w-3 h-3 flex-shrink-0" />{msg.staleness_warning}
                        </div>
                      )}
                      <div className="card p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Brain className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                          <span className="text-xs text-accent font-medium uppercase tracking-wider">Brain</span>
                        </div>
                        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      </div>
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs text-muted uppercase tracking-wider">Sources</p>
                          <div className="flex flex-wrap gap-1.5">
                            {msg.sources.slice(0, 6).map((s, j) => (
                              <div key={j} className="flex items-center gap-1 badge-muted">
                                {s.source_file && <FileCode className="w-2.5 h-2.5" />}
                                <span className="text-xs">{s.label}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="card px-4 py-3 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />
                  <span className="text-xs text-foreground-2">Thinking…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="px-8 py-4 border-t border-border flex-shrink-0">
        <div className="max-w-2xl mx-auto flex gap-2">
          <input
            type="text" className="input flex-1"
            placeholder="Ask anything about your codebase…"
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            disabled={loading}
          />
          <button onClick={() => handleSend()} disabled={loading || !input.trim() || !selectedProject} className="btn-primary px-3">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  )
}
