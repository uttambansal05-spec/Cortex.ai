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

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <div className="animate-slide-up">
      {/* Logo */}
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

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full divider" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-2 bg-surface text-2xs text-muted uppercase tracking-wider">or</span>
            </div>
          </div>

          <button
            onClick={handleGoogle}
            className="btn-secondary w-full justify-center"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>
        </div>
      )}

      <p className="mt-4 text-center text-2xs text-muted">
        By signing in, you agree to our Terms and Privacy Policy.
      </p>
    </div>
  )
}
