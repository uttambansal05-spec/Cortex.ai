'use client'

import { FileText, Brain } from 'lucide-react'

export default function PRDPage() {
  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <FileText className="w-4 h-4 text-accent" />
        <h1 className="text-base font-medium text-foreground">Generate PRD</h1>
      </div>
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-12 h-12 rounded-lg bg-surface-2 border border-border flex items-center justify-center mb-4">
          <Brain className="w-5 h-5 text-muted" />
        </div>
        <h3 className="text-sm font-medium text-foreground mb-1">Coming soon</h3>
        <p className="text-xs text-foreground-2 max-w-xs">
          Generate context-aware PRDs. Brain surfaces what the codebase already supports — you answer only the business questions.
        </p>
      </div>
    </div>
  )
}
