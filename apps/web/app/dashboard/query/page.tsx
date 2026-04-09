'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Brain, Send, Loader2, AlertTriangle, FileCode, Sparkles } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: Array<{ label: string; type: string; source_file?: string }>
  staleness_warning?: string
}

const SUGGESTED = [
  "What does this product do?",
  "What are the biggest risks?",
  "What's the build pipeline?",
  "How does authentication work?",
  "What tables exist in the schema?",
  "What AI models are used?",
]

const NODE_COLORS: Record<string, string> = {
  entity: '#818CF8', decision: '#34D399', risk: '#F87171', gap: '#FBBF24',
  dependency: '#64748B', flow: '#22D3EE', api: '#F472B6', model: '#60A5FA', config: '#A78BFA',
}

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
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-3.5 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="relative text-accent">
            <Brain className="w-[18px] h-[18px]" />
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_6px_#10B981] animate-pulse" />
          </div>
          <span className="text-[15px] font-display font-medium text-text-0">Query Brain</span>
        </div>
        {projects.length > 1 && (
          <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)}
            className="input w-48 text-xs !py-1.5">
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {messages.length === 0 ? (
          <div className="max-w-[620px] mx-auto mt-16 text-center animate-fade-in">
            <div className="w-14 h-14 rounded-2xl bg-accent-muted border border-accent-border flex items-center justify-center mx-auto mb-5 shadow-[0_0_30px_rgba(16,185,129,0.12)]">
              <Brain className="w-6 h-6 text-accent" />
            </div>
            <h2 className="text-lg font-display font-semibold text-text-0 mb-1.5">Ask the Brain anything</h2>
            <p className="text-[13px] text-text-2 mb-7 leading-relaxed">
              Answers grounded in your knowledge graph. No hallucination \u2014 only what the Brain knows.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {SUGGESTED.map(q => (
                <button key={q} onClick={() => handleSend(q)}
                  className="card p-3 text-left text-xs text-text-1 hover:text-text-0 hover:border-accent-border hover:bg-bg-3 transition-all flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-[740px] mx-auto space-y-5">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                <div className="max-w-[88%]">
                  {msg.role === 'user' ? (
                    <div className="bg-accent-muted border border-accent-border rounded-[14px] rounded-br-[4px] px-4 py-3">
                      <p className="text-sm text-text-0 leading-relaxed">{msg.content}</p>
                    </div>
                  ) : (
                    <div>
                      {msg.staleness_warning && (
                        <div className="flex items-center gap-2 text-xs text-warning mb-2">
                          <AlertTriangle className="w-3 h-3 flex-shrink-0" />{msg.staleness_warning}
                        </div>
                      )}
                      <div className="card rounded-[14px] rounded-bl-[4px] p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="w-[7px] h-[7px] rounded-full bg-accent shadow-[0_0_8px_#10B981]" />
                          <span className="text-[10px] font-semibold text-accent uppercase tracking-[0.08em]">Brain</span>
                        </div>
                        <div className="text-[13.5px] text-text-0 leading-[1.8] whitespace-pre-wrap">{msg.content}</div>
                      </div>
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-2.5">
                          <p className="text-[10px] text-text-3 uppercase tracking-[0.04em] mb-1.5">Sources</p>
                          <div className="flex flex-wrap gap-1.5">
                            {msg.sources.slice(0, 6).map((s, j) => (
                              <div key={j} className="flex items-center gap-1.5 badge-muted">
                                <span className="w-[5px] h-[5px] rounded-full" style={{ background: NODE_COLORS[s.type] || '#64748B' }} />
                                <span className="text-[11px]">{s.label}</span>
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
              <div className="flex justify-start animate-fade-in">
                <div className="card px-4 py-3 flex items-center gap-2.5">
                  <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />
                  <span className="text-xs text-text-2">Brain is thinking...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-8 py-4 border-t border-border flex-shrink-0 bg-bg-1/80 backdrop-blur-md">
        <div className="max-w-[740px] mx-auto flex gap-2">
          <input type="text" className="input flex-1"
            placeholder="Ask anything about your codebase..."
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            disabled={loading} />
          <button onClick={() => handleSend()} disabled={loading || !input.trim() || !selectedProject}
            className="btn-primary px-3.5">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  )
}
