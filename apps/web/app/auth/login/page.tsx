'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Brain, ArrowRight, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) { setError(signInError.message); setLoading(false); return }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
    }

window.location.href = '/dashboard'
  }

  return (
    <div className="animate-slide-up">
      <div className="flex items-center gap-2 mb-10">
        <div className="w-7 h-7 rounded bg-accent/20 border border-accent/30 flex items-center justify-center">
          <Brain className="w-4 h-4 text-accent" />
        </div>
        <span className="font-display text-sm tracking-widest text-foreground uppercase">Cortex</span>
      </div>

      <div className="card p-6 space-y-5">
        <div>
          <h1 className="text-sm font-medium text-foreground mb-1">
            {isSignUp ? 'Create your account' : 'Sign in to Cortex'}
          </h1>
          <p className="text-xs text-foreground-2">Early access only.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="input"
            required
            autoFocus
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="input"
            required
            minLength={6}
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <button
            type="submit"
            disabled={loading || !email || !password}
            className="btn-primary w-full justify-center"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                {isSignUp ? 'Create account' : 'Sign in'}
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

        <button
          onClick={() => { setIsSignUp(!isSignUp); setError('') }}
          className="text-xs text-accent hover:text-accent-2 transition-colors w-full text-center"
        >
          {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
        </button>
      </div>
    </div>
  )
}