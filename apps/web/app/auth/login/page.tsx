'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Brain, ArrowRight, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }

    if (data.session) {
      await supabase.auth.setSession(data.session)
      window.location.replace('/dashboard')
    }
  }

  return (
    <div className="animate-slide-up">
      <div className="flex items-center gap-2.5 mb-9">
        <div className="w-8 h-8 rounded-lg bg-accent-muted border border-accent-border flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.12)]">
          <Brain className="w-4.5 h-4.5 text-accent" />
        </div>
        <span className="font-display text-[15px] font-semibold tracking-[0.1em] text-text-0 uppercase">Cortex</span>
      </div>

      <div className="bg-bg-2/90 backdrop-blur-xl border border-border rounded-2xl p-7">
        <div className="mb-6">
          <h1 className="text-lg font-display font-semibold text-text-0 mb-1">
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="text-[13px] text-text-2">
            {isSignUp ? 'Start building your Product Brain' : 'Sign in to your Product Brain'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="label block mb-1.5">Email</label>
            <input type="email" placeholder="you@company.com" value={email}
              onChange={e => setEmail(e.target.value)} className="input" required autoFocus />
          </div>
          <div>
            <label className="label block mb-1.5">Password</label>
            <input type="password" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" value={password}
              onChange={e => setPassword(e.target.value)} className="input" required minLength={6} />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <button type="submit" disabled={loading || !email || !password}
            className="btn-primary w-full justify-center mt-1">
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

        <button onClick={() => { setIsSignUp(!isSignUp); setError('') }}
          className="text-xs text-accent hover:text-accent-hover transition-colors w-full text-center mt-5">
          {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
        </button>
      </div>

      <p className="text-[11px] text-text-3 text-center mt-7 leading-relaxed">
        Your product's living brain.<br />
        <span className="text-text-2">One API for every AI tool.</span>
      </p>
    </div>
  )
}
