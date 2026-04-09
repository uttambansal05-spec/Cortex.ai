'use client'

import { FileText, Brain, ArrowRight } from 'lucide-react'

export default function PRDPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
      <div className="w-14 h-14 rounded-2xl bg-bg-2 border border-border flex items-center justify-center mb-5">
        <FileText className="w-6 h-6 text-text-2" />
      </div>
      <h3 className="text-base font-display font-medium text-text-0 mb-1.5">Generate PRD</h3>
      <p className="text-xs text-text-2 max-w-xs leading-relaxed mb-6">
        Brain surfaces what the codebase already supports \u2014 you answer only the business questions. Full PRD in seconds.
      </p>
      <span className="badge-accent"><ArrowRight className="w-3 h-3" /> Coming soon</span>
    </div>
  )
}
