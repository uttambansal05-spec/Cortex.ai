'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Key, Plus, Copy, Trash2, CheckCircle2 } from 'lucide-react'

export default function SettingsPage() {
  const [session, setSession] = useState<any>(null)
  const [projects, setProjects] = useState<any[]>([])
  const [selectedProject, setSelectedProject] = useState('')
  const [keys, setKeys] = useState<any[]>([])
  const [newKeyName, setNewKeyName] = useState('')
  const [generatedKey, setGeneratedKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const router = useRouter()
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
        setSelectedProject(projs[0].id)
        loadKeys(projs[0].id, session.access_token)
      }
    }
    load()
  }, [])

  const loadKeys = async (projectId: string, token: string) => {
    const res = await fetch(`/api/keys?project_id=${projectId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (res.ok) setKeys(await res.json())
  }

  const handleCreate = async () => {
    if (!newKeyName.trim() || !selectedProject) return
    setLoading(true)
    const res = await fetch('/api/keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ name: newKeyName, project_id: selectedProject }),
    })
    const data = await res.json()
    if (res.ok) {
      setGeneratedKey(data.key)
      setNewKeyName('')
      loadKeys(selectedProject, session?.access_token)
    }
    setLoading(false)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
      <div>
        <h1 className="text-base font-medium text-foreground mb-1">Settings</h1>
        <p className="text-xs text-foreground-2">Manage API keys for the Cortex connector.</p>
      </div>

      {/* Generated key alert */}
      {generatedKey && (
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
            <button onClick={handleCopy} className="btn-secondary px-3 py-2">
              {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className="card-2 p-3 space-y-1">
            <p className="text-2xs font-medium text-foreground">Usage:</p>
            <code className="text-2xs font-mono text-foreground-2 block">
              curl -X POST https://cortex-api-kwfy.onrender.com/api/v1/connector/query \
            </code>
            <code className="text-2xs font-mono text-foreground-2 block">
              {'  '}-H "x-cortex-key: {generatedKey.substring(0, 20)}..." \
            </code>
            <code className="text-2xs font-mono text-foreground-2 block">
              {'  '}-d '{"{"}\"question\": \"What does this product do?\"{"}"}' 
            </code>
          </div>
        </div>
      )}

      {/* Create new key */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-medium text-foreground">Generate API key</h2>
        </div>

        {projects.length > 1 && (
          <div className="space-y-1.5">
            <label className="label">Project</label>
            <select
              value={selectedProject}
              onChange={e => { setSelectedProject(e.target.value); loadKeys(e.target.value, session?.access_token) }}
              className="input"
            >
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="label">Key name</label>
          <input
            type="text"
            className="input"
            placeholder="e.g. cursor-plugin, slack-bot"
            value={newKeyName}
            onChange={e => setNewKeyName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
        </div>

        <button
          onClick={handleCreate}
          disabled={loading || !newKeyName.trim()}
          className="btn-primary"
        >
          <Plus className="w-3.5 h-3.5" />
          {loading ? 'Generating…' : 'Generate key'}
        </button>
      </div>

      {/* Existing keys */}
      {keys.length > 0 && (
        <div className="space-y-3">
          <h2 className="label">Active keys</h2>
          {keys.map(k => (
            <div key={k.id} className="card-2 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Key className="w-3.5 h-3.5 text-muted" />
                <div>
                  <p className="text-sm text-foreground">{k.name}</p>
                  <p className="text-2xs text-muted font-mono">{k.key_prefix}••••••••</p>
                </div>
              </div>
              <button
                onClick={() => handleRevoke(k.id)}
                className="btn-ghost text-danger hover:text-danger"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Connector docs */}
      <div className="card p-5 space-y-3">
        <h2 className="text-sm font-medium text-foreground">Connector API</h2>
        <p className="text-xs text-foreground-2">Use your API key to query the Brain from any tool.</p>
        <div className="space-y-2">
          {[
            { label: 'Query endpoint', value: 'POST /api/v1/connector/query' },
            { label: 'Auth header', value: 'x-cortex-key: ctx_...' },
            { label: 'Base URL', value: 'https://cortex-api-kwfy.onrender.com' },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-2xs text-foreground-2">{label}</span>
              <code className="text-2xs font-mono text-accent">{value}</code>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
