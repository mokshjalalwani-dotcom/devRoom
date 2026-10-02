/**
 * src/components/ImageUpload.tsx
 * Handles image paste, drag-and-drop, and file picker.
 * Compresses client-side to WebP before uploading via signed URL.
 */
'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { compressImage, uploadToSignedUrl } from '../lib/compress'
import { toast } from './Toast'
import { ImageIcon, Upload, X, Loader2 } from 'lucide-react'

interface Props {
  roomId: string
  passcode?: string
  onUploaded: (pendingId: string, width: number, height: number) => Promise<void>
  disabled?: boolean
}

interface UploadState {
  file: File | null
  preview: string | null
  progress: number
  error: string | null
  uploading: boolean
}

const INIT: UploadState = { file: null, preview: null, progress: 0, error: null, uploading: false }

export function ImageUpload({ roomId, passcode, onUploaded, disabled }: Props) {
  const [state, setState] = useState<UploadState>(INIT)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback(async (file: File) => {
    if (!navigator.onLine) {
      toast.error("Can't upload while offline")
      return
    }
    const preview = URL.createObjectURL(file)
    setState({ file, preview, progress: 0, error: null, uploading: false })
  }, [])

  // Global paste handler
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items || [])
      const imageItem = items.find(i => i.type.startsWith('image/'))
      if (imageItem) {
        const file = imageItem.getAsFile()
        if (file) processFile(file)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [processFile])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'))
    if (file) processFile(file)
  }

  const handleUpload = async () => {
    if (!state.file) return
    setState(s => ({ ...s, uploading: true, error: null, progress: 0 }))

    try {
      // Client-side compression
      const compressed = await compressImage(state.file)

      // Get signed upload URLs from server
      const urlRes = await fetch('/api/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          size: compressed.sizeBytes,
          mimeType: 'image/webp',
          passcode: passcode || null
        })
      })

      if (!urlRes.ok) {
        const err = await urlRes.json()
        throw new Error(err.error || 'Upload failed')
      }

      const { pendingId, original, thumbnail } = await urlRes.json()

      // Upload both blobs in parallel
      await Promise.all([
        uploadToSignedUrl(original.signedUrl, compressed.blob, pct => {
          setState(s => ({ ...s, progress: Math.round(pct * 0.8) }))
        }),
        uploadToSignedUrl(thumbnail.signedUrl, compressed.thumbBlob)
      ])

      setState(s => ({ ...s, progress: 90 }))

      // Confirm upload (creates the item)
      await onUploaded(pendingId, compressed.width, compressed.height)

      setState(s => ({ ...s, progress: 100 }))
      setTimeout(() => {
        setState(INIT)
        if (state.preview) URL.revokeObjectURL(state.preview)
      }, 500)

      toast.success('Image uploaded')
    } catch (e: any) {
      setState(s => ({ ...s, uploading: false, error: e.message }))
    }
  }

  const cancel = () => {
    if (state.preview) URL.revokeObjectURL(state.preview)
    setState(INIT)
  }

  if (state.preview) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.preview} alt="Preview" className="w-full max-h-64 object-contain bg-zinc-50 dark:bg-zinc-950" />
          {!state.uploading && (
            <button onClick={cancel} className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white hover:bg-black/70 transition">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="p-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-3">
          {state.uploading ? (
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <Loader2 size={14} className="animate-spin text-blue-500" />
                <span className="text-xs text-zinc-500">Uploading... {state.progress}%</span>
              </div>
              <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5">
                <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${state.progress}%` }} />
              </div>
            </div>
          ) : (
            <>
              {state.error && <p className="flex-1 text-xs text-red-500">{state.error}</p>}
              {!state.error && <p className="flex-1 text-xs text-zinc-500">{state.file?.name}</p>}
              <button
                onClick={handleUpload}
                disabled={disabled}
                className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition"
              >
                <Upload size={12} />
                Upload Image
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onClick={() => inputRef.current?.click()}
      className={`flex items-center justify-center gap-3 p-4 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
        dragging
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
          : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
      }`}
    >
      <ImageIcon size={16} className="text-zinc-400" />
      <span className="text-sm text-zinc-500">
        Drag & drop, paste <kbd className="font-sans bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-xs">Ctrl+V</kbd>, or click to pick an image
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f) }}
      />
    </div>
  )
}
