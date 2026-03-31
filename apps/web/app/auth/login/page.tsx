'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Brain, ArrowRight, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
  options: { 
    shouldCreateUser: true,
    data: {}
  }
    })
    if (error) { setError(error.message); setLoading(false); return }
    setSent(true)
    setLoading(false)
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp.trim(),
      type: 'email'
    })
    if (error) { setError(error.message); setLoading(false); return }
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
        {!sent ? (
          <>
            <div>
              <h1 className="text-sm font-medium text-foreground mb-1">Sign in to Cortex</h1>
              <p className="text-xs text-foreground-2">Enter your email to receive a 6-digit code.</p>
            </div>
            <form onSubmit={handleSendOtp} className="space-y-3">
              <input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input"
                required
                autoFocus
              />
              {error && <p className="text-xs text-danger">{error}</p>}
              <button type="submit" disabled={loading || !email.trim()} className="btn-primary w-full justify-center">
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><span>Send code</span><ArrowRight className="w-3.5 h-3.5" /></>}
              </button>
            </form>
          </>
        ) : (
          <>
            <div>
              <h1 className="text-sm font-medium text-foreground mb-1">Check your email</h1>
              <p className="text-xs text-foreground-2">Enter the 6-digit code sent to <span className="text-foreground">{email}</span></p>
            </div>
            <form onSubmit={handleVerifyOtp} className="space-y-3">
              <input
                type="text"
                placeholder="123456"
                value={otp}
                onChange={e => setOtp(e.target.value)}
                className="input text-center text-lg tracking-widest"
                maxLength={6}
                required
                autoFocus
              />
              {error && <p className="text-xs text-danger">{error}</p>}
              <button type="submit" disabled={loading || otp.length !== 6} className="btn-primary w-full justify-center">
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Verify & sign in'}
              </button>
            </form>
            <button onClick={() => setSent(false)} className="text-xs text-accent hover:text-accent-2 transition-colors">
              Use a different email
            </button>
          </>
        )}
      </div>
    </div>
  )
}