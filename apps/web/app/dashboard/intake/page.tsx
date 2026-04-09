'use client'

import { Inbox, ArrowRight } from 'lucide-react'

export default function IntakePage() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
      <div className="w-14 h-14 rounded-2xl bg-bg-2 border border-border flex items-center justify-center mb-5">
        <Inbox className="w-6 h-6 text-text-2" />
      </div>
      <h3 className="text-base font-display font-medium text-text-0 mb-1.5">Intake</h3>
      <p className="text-xs text-text-2 max-w-xs leading-relaxed mb-6">
        Submit feature requests. Brain cross-checks against the codebase \u2014 flags duplicates, surfaces feasibility.
      </p>
      <span className="badge-accent"><ArrowRight className="w-3 h-3" /> Coming soon</span>
    </div>
  )
}
