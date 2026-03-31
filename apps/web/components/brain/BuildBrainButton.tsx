'use client'

import { useState } from 'react'
import { Brain, Loader2, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Props {
  projectId: string
  isBuilding: boolean
  hasExistingBrain: boolean
}

export default function BuildBrainButton({ projectId, isBuilding, hasExistingBrain }: Props) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleBuild = async () => {
    setLoading(true)
    try {
      await fetch(`/api/v1/brain/${projectId}/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger: 'manual', incremental: false }),
      })
      router.refresh()
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const busy = isBuilding || loading

  return (
    <button
      onClick={handleBuild}
      disabled={busy}
      className="btn-primary"
    >
      {busy ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : hasExistingBrain ? (
        <RefreshCw className="w-3.5 h-3.5" />
      ) : (
        <Brain className="w-3.5 h-3.5" />
      )}
      {busy ? 'Building…' : hasExistingBrain ? 'Rebuild Brain' : 'Build Brain'}
    </button>
  )
}
