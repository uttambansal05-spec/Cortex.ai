'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { 
  Key, Plus, Trash2, Copy, CheckCircle2, ChevronDown, ChevronRight,
  Loader2, AlertTriangle, Terminal, Code2, Braces, BookOpen
} from 'lucide-react'

type ApiKey = {
  id: string
  name: string
  key_prefix: string
  project_id: string
  created_at: string
  is_active: boolean
}

type Project = {
  id: string
  name: string
}

const TABS = [
  { id: 'claude', label: 'Claude Projects', icon: BookOpen },
  { id: 'cursor', label: 'Cursor', icon: Code2 },
  { id: 'api', label: 'API / cURL', icon: Braces },
] as const

type TabId = typeof TABS[number]['id']

function getInstruction(tab: TabId, key: string, projectId: string, projectName: string): string {
  const baseUrl = 'https://cortex-api-kwfy.onrender.com/api/v1/connector/query'

  if (tab === 'claude') {
    return `You have access to the Cortex Brain for the "${projectName}" codebase.

ALWAYS query the Brain before answering ANY question about this codebase. This includes questions about:
- Components, functions, hooks, modules
- User flows and features
- Risks and bugs
- Design decisions and architecture
- Dependencies and relationships

To query the Brain, make this API call:

POST ${baseUrl}
Header: x-cortex-key: ${key}
Header: Content-Type: application/json
Body: {"question": "<user's question>", "project_id": "${projectId}"}

Rules:
- Always call the Brain first
- Cite specific components, files and decisions from the Brain response
- If Brain returns a staleness warning, mention it
- Never answer from memory alone — always verify with the Brain`
  }

  if (tab === 'cursor') {
    return `When asked about this codebase, first query the Cortex Brain:

curl -X POST ${baseUrl} \\
  -H "x-cortex-key: ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"question": "YOUR_QUESTION", "project_id": "${projectId}"}'

Use the Brain's answer as authoritative context before responding.
The Brain contains ${projectName}'s full knowledge graph — components, decisions, risks, and dependencies.`
  }

  // api / cURL
  return `curl -X POST ${baseUrl} \\
  -H "x-cortex-key: ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "question": "What are the main components and how do they interact?",
    "project_id": "${projectId}"
  }'`
}

function getUsageHint(tab: TabId): string {
  if (tab === 'claude') return 'Paste this into a Claude Project\'s custom instructions.'
  if (tab === 'cursor') return 'Add this to .cursor/rules in your repo root.'
  return 'Run this from any terminal to test the connection.'
}

export default function SettingsPage() {
  const supabase = createClient()
  const [session, setSession] = useState<any>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [selectedProjectName, setSelectedProjectName] = useState<string>('')
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [newKeyName, setNewKeyName] = useState('')
  const [generatedKey, setGeneratedKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  // Instruction panel state
  const [showInstructions, setShowInstructions] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('claude')
  const [instructionCopied, setInstructionCopied] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) loadProjects(data.session.access_token)
    })
  }, [])

  const loadProjects = async (token: string) => {
    const res = await fetch('/api/projects', {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    const data = await res.json()
    if (data.length > 0) {
      setProjects(data)
      setSelectedProject(data[0].id)
      setSelectedProjectName(data[0].name)
      loadKeys(data[0].id, token)
    }
  }

  const loadKeys = async (projectId: string, token?: string) => {
    const t = token || session?.access_token
    const res = await fetch(`/api/keys?project_id=${projectId}`, {
      headers: { 'Authorization': `Bearer ${t}` },
    })
    const data = await res.json()
    setKeys(data)
  }

  const handleProjectChange = (pid: string) => {
    setSelectedProject(pid)
    const proj = projects.find(p => p.id === pid)
    setSelectedProjectName(proj?.name || '')
    loadKeys(pid, session?.access_token)
    setGeneratedKey('')
    setShowInstructions(false)
  }

  const handleGenerate = async () => {
    if (!newKeyName.trim() || !selectedProject) return
    setLoading(true)
    const res = await fetch('/api/keys', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session?.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: newKeyName, project_id: selectedProject }),
    })
    const data = await res.json()
    if (res.ok) {
      setGeneratedKey(data.key)
      setNewKeyName('')
      setShowInstructions(true)
      loadKeys(selectedProject, session?.access_token)
    }
    setLoading(false)
  }

  const handleCopyKey = () => {
    navigator.clipboard.writeText(generatedKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleCopyInstruction = () => {
    const text = getInstruction(activeTab, generatedKey, selectedProject, selectedProjectName)
    navigator.clipboard.writeText(text)
    setInstructionCopied(true)
    setTimeout(() => setInstructionCopied(false), 2000)
  }

  const handleRevoke = async (keyId: string) => {
    await fetch(`/api/keys/${keyId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${session?.access_token}` },
    })
    loadKeys(selectedProject, session?.access_token)
  }

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-base font-medium text-foreground mb-1">Settings</h1>
        <p className="text-xs text-foreground-2">Manage API keys for the Cortex connector.</p>
      </div>

      {/* Project selector */}
      {projects.length > 1 && (
        <div>
          <label className="text-xs text-foreground-2 block mb-1.5">Project</label>
          <select
            value={selectedProject}
            onChange={e => handleProjectChange(e.target.value)}
            className="input w-full"
          >
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Generate new key */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-medium text-foreground">Generate API Key</h2>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            className="input flex-1"
            placeholder="Key name (e.g. cursor-dev)"
            value={newKeyName}
            onChange={e => setNewKeyName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleGenerate()}
          />
          <button
            onClick={handleGenerate}
            disabled={loading || !newKeyName.trim()}
            className="btn-primary px-4 py-2 flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Generate
          </button>
        </div>
      </div>

      {/* Generated key alert */}
      {generatedKey && (
        <div className="space-y-4">
          {/* Key display */}
          <div className="card p-4 border-success/30 bg-success/5 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              <p className="text-sm font-medium text-foreground">API key generated — copy it now</p>
            </div>
            <p className="text-2xs text-foreground-2">This key will never be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-surface-2 px-3 py-2 rounded text-accent truncate">
                {generatedKey}
              </code>
              <button onClick={handleCopyKey} className="btn-secondary px-3 py-2">
                {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Connect to AI Tools — instruction panel */}
          <div className="card overflow-hidden">
            {/* Toggle header */}
            <button
              onClick={() => setShowInstructions(!showInstructions)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-2/50 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Terminal className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium text-foreground">Connect to AI Tools</span>
                <span className="text-2xs text-foreground-2 bg-accent/10 text-accent px-2 py-0.5 rounded-full">
                  ready to use
                </span>
              </div>
              {showInstructions
                ? <ChevronDown className="w-4 h-4 text-foreground-2" />
                : <ChevronRight className="w-4 h-4 text-foreground-2" />
              }
            </button>

            {showInstructions && (
              <div className="border-t border-border">
                {/* Tabs */}
                <div className="flex border-b border-border">
                  {TABS.map(tab => {
                    const Icon = tab.icon
                    const isActive = activeTab === tab.id
                    return (
                      <button
                        key={tab.id}
                        onClick={() => { setActiveTab(tab.id); setInstructionCopied(false) }}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-xs font-medium transition-colors
                          ${isActive
                            ? 'text-accent border-b-2 border-accent bg-accent/5'
                            : 'text-foreground-2 hover:text-foreground hover:bg-surface-2/50'
                          }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {tab.label}
                      </button>
                    )
                  })}
                </div>

                {/* Hint */}
                <div className="px-5 pt-4 pb-2">
                  <p className="text-xs text-foreground-2">{getUsageHint(activeTab)}</p>
                </div>

                {/* Instruction block */}
                <div className="px-5 pb-4">
                  <div className="relative group">
                    <pre className="text-xs font-mono bg-surface-2 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap break-all text-foreground/80 leading-relaxed max-h-72 overflow-y-auto">
                      {getInstruction(activeTab, generatedKey, selectedProject, selectedProjectName)}
                    </pre>
                    <button
                      onClick={handleCopyInstruction}
                      className={`absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all
                        ${instructionCopied
                          ? 'bg-success/20 text-success'
                          : 'bg-surface-3 text-foreground-2 opacity-0 group-hover:opacity-100 hover:text-foreground'
                        }`}
                    >
                      {instructionCopied ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Existing keys list */}
      {keys.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs text-foreground-2 uppercase tracking-wider">Active Keys</h2>
          <div className="space-y-2">
            {keys.map(k => (
              <div key={k.id} className="card px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Key className="w-3.5 h-3.5 text-foreground-2" />
                  <div>
                    <p className="text-sm text-foreground">{k.name}</p>
                    <p className="text-2xs text-foreground-2 font-mono">{k.key_prefix}••••••••</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-2xs text-foreground-2">
                    {new Date(k.created_at).toLocaleDateString()}
                  </span>
                  <button
                    onClick={() => handleRevoke(k.id)}
                    className="text-foreground-2 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
