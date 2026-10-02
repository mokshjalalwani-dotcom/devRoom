'use client'
import { useState, useRef, useEffect } from 'react'
import { detectContent } from '../lib/detector'
import { scanForSecrets } from '../lib/secrets'
import { ContentType } from '../lib/detector'
import { SecretWarningDialog } from './SecretWarningDialog'
import { SendHorizontal, Tag, Flame, Plus, X } from 'lucide-react'
import { toast } from './Toast'

interface Props {
  onAdd: (content: string, type: ContentType, language?: string, meta?: any, options?: { tags?: string[], burnAfterRead?: boolean }) => Promise<void>
}

export function PasteBox({ onAdd }: Props) {
  const [text, setText] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [warningSecrets, setWarningSecrets] = useState<string[]>([])
  
  // v2 feature states
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [burnAfterRead, setBurnAfterRead] = useState(false)
  const [showOptions, setShowOptions] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      // Global shortcut to focus textarea unless it's already focused or inside an input
      if (document.activeElement?.tagName === 'INPUT') return
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
      // Don't intercept if pasting into the tag input
      if (document.activeElement?.tagName === 'INPUT') return
      
      // If we paste an image, the global handler in ImageUpload will handle it
      if (e.clipboardData?.items) {
        const hasImage = Array.from(e.clipboardData.items).some(i => i.type.startsWith('image/'))
        if (hasImage) return // let ImageUpload handle it
      }

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
      await onAdd(text, type, language, meta, { tags, burnAfterRead })
      setText('')
      setTags([])
      setBurnAfterRead(false)
      setShowOptions(false)
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

  const handleTagAdd = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const t = tagInput.trim().toLowerCase()
      if (t && !tags.includes(t) && tags.length < 5 && t.length <= 24) {
        setTags([...tags, t])
        setTagInput('')
      }
    }
  }

  return (
    <>
      <div className="relative group rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm focus-within:ring-2 focus-within:ring-blue-500/50 focus-within:border-blue-500 transition-all overflow-hidden flex flex-col">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Paste anything... (Ctrl/Cmd + Enter to send)"
          className="w-full min-h-[120px] max-h-[60vh] p-4 bg-transparent resize-y outline-none text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 font-mono text-[15px] leading-relaxed"
        />
        
        {showOptions && (
          <div className="px-4 py-3 bg-zinc-50 dark:bg-[#0a0d12] border-t border-zinc-100 dark:border-zinc-800 flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Tag size={14} className="text-zinc-400" />
              {tags.map(t => (
                <span key={t} className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 rounded-full text-xs font-medium">
                  {t}
                  <button onClick={() => setTags(tags.filter(x => x !== t))} className="hover:text-blue-900 dark:hover:text-blue-200 transition">
                    <X size={12} />
                  </button>
                </span>
              ))}
              {tags.length < 5 && (
                <input
                  type="text"
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={handleTagAdd}
                  placeholder={tags.length === 0 ? "Add tags (press Enter)..." : "Add tag..."}
                  className="bg-transparent border-none outline-none text-xs text-zinc-600 dark:text-zinc-300 w-32 focus:ring-0 p-0 ml-1 placeholder-zinc-400"
                  maxLength={24}
                />
              )}
            </div>
            
            <label className="flex items-center gap-2 cursor-pointer w-max group">
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${burnAfterRead ? 'bg-orange-500 border-orange-500 text-white' : 'border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 group-hover:border-orange-400'}`}>
                {burnAfterRead && <Flame size={10} />}
              </div>
              <input type="checkbox" className="hidden" checked={burnAfterRead} onChange={e => setBurnAfterRead(e.target.checked)} />
              <span className={`text-sm ${burnAfterRead ? 'text-orange-600 dark:text-orange-400 font-medium' : 'text-zinc-600 dark:text-zinc-400'}`}>Burn after reading</span>
            </label>
          </div>
        )}

        <div className="flex justify-between items-center p-2 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-2 pl-2">
            <button 
              onClick={() => setShowOptions(!showOptions)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${showOptions || tags.length > 0 || burnAfterRead ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200' : 'text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800'}`}
            >
              <Plus size={14} /> Options {tags.length > 0 && `(${tags.length})`}
            </button>
            <div className="text-xs text-zinc-400 hidden sm:block ml-2">
              <kbd className="font-sans px-1 rounded border border-zinc-200 dark:border-zinc-700">⌘</kbd> + <kbd className="font-sans px-1 rounded border border-zinc-200 dark:border-zinc-700">↵</kbd> to submit
            </div>
          </div>
          <button
            onClick={() => handleSubmit()}
            disabled={!text.trim() || isAdding}
            className="flex items-center justify-center gap-2 px-5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
          >
            <SendHorizontal size={14} />
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
