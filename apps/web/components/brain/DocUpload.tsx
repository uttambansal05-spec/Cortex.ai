'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, FileText, Check, AlertCircle, X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const ALLOWED_TYPES = ['.md', '.txt', '.pdf', '.docx']
const MAX_SIZE = 2 * 1024 * 1024 // 2MB

interface DocUploadProps {
  projectId: string
  onComplete?: () => void
}

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error'

interface FileUpload {
  file: File
  status: UploadStatus
  message?: string
}

export default function DocUpload({ projectId, onComplete }: DocUploadProps) {
  const [uploads, setUploads] = useState<FileUpload[]>([])
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const validateFile = (file: File): string | null => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED_TYPES.includes(ext)) {
      return `Unsupported type: ${ext}. Use ${ALLOWED_TYPES.join(', ')}`
    }
    if (file.size > MAX_SIZE) {
      return `Too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max 2MB.`
    }
    return null
  }

  const uploadFile = async (fileUpload: FileUpload, index: number) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    setUploads(prev => prev.map((u, i) =>
      i === index ? { ...u, status: 'uploading' as UploadStatus } : u
    ))

    const formData = new FormData()
    formData.append('file', fileUpload.file)

    try {
      const res = await fetch(`/api/brain/${projectId}/ingest-doc`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
        body: formData,
      })

      if (res.ok) {
        setUploads(prev => prev.map((u, i) =>
          i === index ? { ...u, status: 'success' as UploadStatus, message: 'Ingesting...' } : u
        ))
        onComplete?.()
      } else {
        const data = await res.json().catch(() => ({ detail: 'Upload failed' }))
        setUploads(prev => prev.map((u, i) =>
          i === index ? { ...u, status: 'error' as UploadStatus, message: data.detail || 'Upload failed' } : u
        ))
      }
    } catch (e) {
      setUploads(prev => prev.map((u, i) =>
        i === index ? { ...u, status: 'error' as UploadStatus, message: 'Network error' } : u
      ))
    }
  }

  const handleFiles = useCallback((files: FileList | File[]) => {
    const newUploads: FileUpload[] = []
    Array.from(files).forEach(file => {
      const error = validateFile(file)
      if (error) {
        newUploads.push({ file, status: 'error', message: error })
      } else {
        newUploads.push({ file, status: 'idle' })
      }
    })

    const startIndex = uploads.length
    setUploads(prev => [...prev, ...newUploads])

    // Auto-upload valid files
    newUploads.forEach((u, i) => {
      if (u.status === 'idle') {
        uploadFile(u, startIndex + i)
      }
    })
  }, [uploads.length, projectId])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length) {
      handleFiles(e.dataTransfer.files)
    }
  }, [handleFiles])

  const removeUpload = (index: number) => {
    setUploads(prev => prev.filter((_, i) => i !== index))
  }

  const activeUploads = uploads.filter(u => u.status === 'uploading').length
  const successCount = uploads.filter(u => u.status === 'success').length

  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
          <FileText className="w-4 h-4 text-accent" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Add Documents</p>
          <p className="text-xs text-foreground-2">PRDs, architecture docs, specs — enrich the Brain with product context</p>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`
          border border-dashed rounded-lg p-6 text-center cursor-pointer transition-all
          ${dragOver
            ? 'border-accent bg-accent/5'
            : 'border-border hover:border-border-2 hover:bg-surface-2/50'
          }
        `}
      >
        <Upload className={`w-5 h-5 mx-auto mb-2 ${dragOver ? 'text-accent' : 'text-foreground-2'}`} />
        <p className="text-xs text-foreground-2">
          Drop files here or <span className="text-accent">browse</span>
        </p>
        <p className="text-xs text-muted mt-1">.md, .txt, .pdf, .docx — max 2MB each</p>
        <input
          ref={inputRef}
          type="file"
          accept=".md,.txt,.pdf,.docx"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {/* Upload list */}
      {uploads.length > 0 && (
        <div className="mt-3 space-y-2">
          {uploads.map((u, i) => (
            <div key={i} className="flex items-center gap-2 p-2 bg-surface-2 rounded-lg">
              {u.status === 'uploading' && <Loader2 className="w-3.5 h-3.5 text-accent animate-spin flex-shrink-0" />}
              {u.status === 'success' && <Check className="w-3.5 h-3.5 text-accent flex-shrink-0" />}
              {u.status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-danger flex-shrink-0" />}
              {u.status === 'idle' && <FileText className="w-3.5 h-3.5 text-foreground-2 flex-shrink-0" />}

              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground truncate">{u.file.name}</p>
                {u.message && (
                  <p className={`text-xs ${u.status === 'error' ? 'text-danger' : 'text-foreground-2'}`}>
                    {u.message}
                  </p>
                )}
              </div>

              <span className="text-xs text-muted flex-shrink-0">
                {(u.file.size / 1024).toFixed(0)}KB
              </span>

              {(u.status === 'success' || u.status === 'error') && (
                <button onClick={() => removeUpload(i)} className="text-foreground-2 hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {successCount > 0 && activeUploads === 0 && (
        <p className="text-xs text-accent mt-3">
          {successCount} doc{successCount > 1 ? 's' : ''} ingesting — nodes will appear in the Brain shortly
        </p>
      )}
    </div>
  )
}
