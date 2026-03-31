'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Github, Loader2, ArrowRight } from 'lucide-react'
import Link from 'next/link'

export default function NewProjectPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '',
    github_repo_url: '',
    default_branch: 'main',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.github_repo_url) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/v1/projects/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          github_repo_url: form.github_repo_url,
          config: { default_branch: form.default_branch },
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to create project')
      }

      const project = await res.json()
      router.push(`/dashboard/projects/${project.id}`)
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-lg mx-auto">
      <Link href="/dashboard" className="btn-ghost mb-6 -ml-1 inline-flex">
        <ArrowLeft className="w-3.5 h-3.5" />
        Back
      </Link>

      <h1 className="text-base font-medium text-foreground mb-1">New project</h1>
      <p className="text-xs text-foreground-2 mb-8">
        Connect a GitHub repo to start building your Product Brain.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <label className="label">Project name</label>
          <input
            type="text"
            className="input"
            placeholder="Payments App"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            required
          />
        </div>

        <div className="space-y-1.5">
          <label className="label">GitHub repo URL</label>
          <div className="relative">
            <Github className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
            <input
              type="url"
              className="input pl-8"
              placeholder="https://github.com/org/repo"
              value={form.github_repo_url}
              onChange={e => setForm(f => ({ ...f, github_repo_url: e.target.value }))}
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="label">Default branch</label>
          <input
            type="text"
            className="input"
            placeholder="main"
            value={form.default_branch}
            onChange={e => setForm(f => ({ ...f, default_branch: e.target.value }))}
          />
        </div>

        {error && (
          <p className="text-xs text-danger">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !form.name || !form.github_repo_url}
          className="btn-primary w-full justify-center"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <>
              Create project
              <ArrowRight className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </form>

      <div className="mt-8 card p-4 space-y-2">
        <p className="text-xs font-medium text-foreground">After creating:</p>
        <ol className="space-y-1.5 text-xs text-foreground-2 list-decimal list-inside">
          <li>Add a <code className="text-accent font-mono">.cortexignore</code> file to exclude sensitive paths</li>
          <li>Trigger your first Brain build from the project dashboard</li>
          <li>Build takes 2–10 minutes depending on repo size</li>
        </ol>
      </div>
    </div>
  )
}
