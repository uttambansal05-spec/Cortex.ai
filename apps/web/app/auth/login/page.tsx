'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Brain, ArrowRight, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  return (
    <div className="animate-slide-up">
      <div className="flex items-center gap-2 mb-10">
        <div className="w-7 h-7 rounded bg-accent/20 border border-accent/30 flex items-center justify-center">
          <Brain className="w-4 h-4 text-accent" />
        </div>
        <span className="font-display text-sm tracking-widest text-foreground uppercase">Cortex</span>
      </div>

      {sent ? (
        <div className="card p-6 space-y-3">
          <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center mb-4">
            <div className="w-2 h-2 rounded-full bg-success" />
          </div>
          <h1 className="text-sm font-medium text-foreground">Check your email</h1>
          <p className="text-xs text-foreground-2 leading-relaxed">
            We sent a magic link to <span className="text-foreground">{email}</span>.
            Click it to sign in.
          </p>
          <button
            onClick={() => setSent(false)}
            className="text-xs text-accent hover:text-accent-2 transition-colors"
          >
            Use a different email
          </button>
        </div>
      ) : (
        <div className="card p-6 space-y-5">
          <div>
            <h1 className="text-sm font-medium text-foreground mb-1">Sign in to Cortex</h1>
            <p className="text-xs text-foreground-2">Early access only. No password required.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-3">
            <input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              required
              autoFocus
            />
            {error && (
              <p className="text-xs text-danger">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="btn-primary w-full justify-center"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  Continue with email
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        </div>
      )}

      <p className="mt-4 text-center text-2xs text-muted">
        By signing in, you agree to our Terms and Privacy Policy.
      </p>
    </div>
  )
}
