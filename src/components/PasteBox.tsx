'use client'
import { useState, useRef, useEffect } from 'react'
import { detectContent } from '../lib/detector'
import { scanForSecrets } from '../lib/secrets'
import { ContentType } from '../lib/detector'
import { SecretWarningDialog } from './SecretWarningDialog'
import { SendHorizontal } from 'lucide-react'
import { toast } from './Toast'

interface Props {
  onAdd: (content: string, type: ContentType, language?: string, meta?: any) => Promise<void>
}

export function PasteBox({ onAdd }: Props) {
  const [text, setText] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [warningSecrets, setWarningSecrets] = useState<string[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) && document.activeElement !== textareaRef.current) {
        e.preventDefault()
        textareaRef.current?.focus()
      }
      if (e.key === 'Escape') {
        setText('')
        textareaRef.current?.blur()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (document.activeElement !== textareaRef.current && e.clipboardData) {
        const paste = e.clipboardData.getData('text')
        if (paste) {
          setText(prev => prev + paste)
          textareaRef.current?.focus()
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const handleSubmit = async (bypassWarning = false) => {
    if (!text.trim()) return

    if (!bypassWarning) {
      const secrets = scanForSecrets(text)
      if (secrets.length > 0) {
        setWarningSecrets(secrets.map(s => s.name))
        return
      }
    }

    setIsAdding(true)
    const { type, language, meta } = detectContent(text)
    try {
      await onAdd(text, type, language, meta)
      setText('')
      setWarningSecrets([])
    } catch (e) {
      toast.error('Failed to add item')
    } finally {
      setIsAdding(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <>
      <div className="relative group rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm focus-within:ring-2 focus-within:ring-blue-500/50 focus-within:border-blue-500 transition-all overflow-hidden">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Paste anything... (Ctrl/Cmd + Enter to send)"
          className="w-full min-h-[140px] max-h-[60vh] p-4 bg-transparent resize-y outline-none text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 font-mono text-[15px] leading-relaxed"
        />
        <div className="flex justify-between items-center p-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="text-xs text-zinc-500 font-medium px-2 hidden sm:block">
            Tip: Press <kbd className="font-sans bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700">Cmd</kbd> + <kbd className="font-sans bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700">Enter</kbd> to submit
          </div>
          <div className="flex-1 sm:hidden"></div>
          <button
            onClick={() => handleSubmit()}
            disabled={!text.trim() || isAdding}
            className="flex items-center justify-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
          >
            <SendHorizontal size={16} />
            {isAdding ? 'Adding...' : 'Add to Room'}
          </button>
        </div>
      </div>
      
      <SecretWarningDialog
        isOpen={warningSecrets.length > 0}
        secretNames={warningSecrets}
        onConfirm={() => handleSubmit(true)}
        onCancel={() => setWarningSecrets([])}
      />
    </>
  )
}
