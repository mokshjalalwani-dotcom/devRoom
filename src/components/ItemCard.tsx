'use client'
import { useState, useEffect } from 'react'
import { Item, getFileUrl, consumeItem, updateItemTags, pinItem } from '../lib/api'
import { formatDistanceToNow } from 'date-fns'
import {
  Copy, Trash2, ChevronDown, ChevronUp, Link as LinkIcon, Terminal, Code2,
  Database, AlertCircle, Key, FileText, Braces, Image as ImageIcon,
  Flame, AlignLeft, SplitSquareHorizontal, FileQuestion, Clock, FileDigit, Shield, Tag, Pin
} from 'lucide-react'
import { toast } from './Toast'
import { CodeHighlighter } from './Highlighter'
import { curlToFetch } from '../lib/detector'

interface Props {
  item: Item
  roomId: string
  passcode?: string
  readToken?: string
  onDelete: (id: string) => void
  onConsumed?: (id: string, content: string) => void
  onTagUpdate?: (id: string, tags: string[]) => void
  onPinUpdate?: (id: string, pinned: boolean) => void
}

const typeConfig: Record<string, any> = {
  url: { icon: LinkIcon, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  json: { icon: Braces, color: 'text-yellow-600 dark:text-yellow-500', bg: 'bg-yellow-500/10' },
  sql: { icon: Database, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
  command: { icon: Terminal, color: 'text-emerald-600 dark:text-emerald-500', bg: 'bg-emerald-500/10' },
  error: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
  code: { icon: Code2, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  env: { icon: Key, color: 'text-cyan-600 dark:text-cyan-500', bg: 'bg-cyan-500/10' },
  text: { icon: FileText, color: 'text-zinc-500', bg: 'bg-zinc-500/10' },
  image: { icon: ImageIcon, color: 'text-pink-500', bg: 'bg-pink-500/10' },
  log: { icon: AlignLeft, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  diff: { icon: SplitSquareHorizontal, color: 'text-lime-600 dark:text-lime-500', bg: 'bg-lime-500/10' },
  markdown: { icon: FileQuestion, color: 'text-sky-500', bg: 'bg-sky-500/10' },
  curl: { icon: Terminal, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  jwt: { icon: Shield, color: 'text-violet-500', bg: 'bg-violet-500/10' },
  timestamp: { icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  base64: { icon: FileDigit, color: 'text-slate-500', bg: 'bg-slate-500/10' },
}

function ImageRenderer({ item, roomId, passcode, readToken }: { item: Item, roomId: string, passcode?: string, readToken?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    getFileUrl(item.id, { roomId, passcode, readToken, variant: expanded ? 'full' : 'thumb' })
      .then(setUrl)
      .catch(() => setError(true))
  }, [item.id, roomId, passcode, readToken, expanded])

  if (error) return <div className="p-4 text-red-500 text-sm">Failed to load image</div>
  if (!url) return <div className="p-4 text-zinc-500 text-sm animate-pulse">Loading image...</div>

  return (
    <div className="bg-zinc-100 dark:bg-zinc-950 flex justify-center p-2 relative group cursor-pointer" onClick={() => setExpanded(!expanded)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Uploaded" className={`rounded ${expanded ? 'max-h-screen object-contain' : 'max-h-64 object-cover'}`} />
      <div className="absolute bottom-4 right-4 bg-black/60 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition">
        {expanded ? 'Click to shrink' : 'Click to expand'}
      </div>
    </div>
  )
}

export function ItemCard({ item, roomId, passcode, readToken, onDelete, onConsumed, onTagUpdate, onPinUpdate }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [burning, setBurning] = useState(false)
  
  const config = typeConfig[item.type] || typeConfig.text
  const Icon = config.icon

  const handleCopy = () => {
    if (item.content) {
      navigator.clipboard.writeText(item.content)
      toast.success('Copied to clipboard')
    }
  }

  const handleConsume = async () => {
    setBurning(true)
    try {
      const content = await consumeItem(roomId, item.id, passcode)
      if (onConsumed) onConsumed(item.id, content)
    } catch (e: any) {
      toast.error(e.message)
      setBurning(false)
    }
  }

  const handlePin = async () => {
    if (readToken) return
    const newPin = !item.pinned
    try {
      if (onPinUpdate) onPinUpdate(item.id, newPin)
      await pinItem(roomId, item.id, newPin, passcode)
    } catch (e: any) {
      toast.error(e.message)
      if (onPinUpdate) onPinUpdate(item.id, !newPin) // revert
    }
  }

  if (item.content_hidden && item.burn_after_read) {
    return (
      <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/50 rounded-xl overflow-hidden shadow-sm p-6 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/50 rounded-full flex items-center justify-center mb-3">
          <Flame size={24} className="text-orange-500" />
        </div>
        <h3 className="font-semibold text-orange-800 dark:text-orange-300 mb-1">Burn-after-reading Message</h3>
        <p className="text-sm text-orange-600 dark:text-orange-400 mb-4 max-w-sm">
          This message can only be viewed once. If you reveal it, it will be permanently deleted for everyone.
        </p>
        <button
          onClick={handleConsume}
          disabled={burning || !!readToken}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg transition disabled:opacity-50"
        >
          {burning ? 'Revealing...' : readToken ? 'Cannot read in read-only mode' : 'Reveal Secret'}
        </button>
      </div>
    )
  }

  const lines = (item.content || '').split('\n')
  const isLong = item.type !== 'image' && (lines.length > 8 || (item.content || '').length > 500)
  const displayContent = expanded ? item.content : (isLong ? lines.slice(0, 8).join('\n') + (lines.length > 8 ? '\n...' : '') : item.content)

  const renderContent = () => {
    if (!item.content && item.type !== 'image') return null

    switch (item.type) {
      case 'image':
        return <ImageRenderer item={item} roomId={roomId} passcode={passcode} readToken={readToken} />
      
      case 'url':
        return (
          <div className="p-4 bg-zinc-50/50 dark:bg-[#0d1117]/50">
            <a href={item.content!} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline break-all font-medium">
              {item.meta?.title || item.content}
            </a>
            {item.meta?.domain && <div className="text-xs text-zinc-500 mt-1">{item.meta.domain}</div>}
          </div>
        )
      
      case 'json':
        try {
          const parsed = JSON.parse(item.content!)
          const pretty = JSON.stringify(parsed, null, 2)
          return (
            <div className="bg-zinc-50 dark:bg-[#0d1117]">
              <CodeHighlighter code={expanded ? pretty : pretty.split('\n').slice(0, 8).join('\n') + (pretty.split('\n').length > 8 && !expanded ? '\n...' : '')} language="json" />
            </div>
          )
        } catch {
          return <div className="bg-zinc-50 dark:bg-[#0d1117]"><CodeHighlighter code={displayContent!} language="json" /></div>
        }
      
      case 'error':
        return (
          <div className="p-4 bg-red-50/50 dark:bg-red-950/20 font-mono text-sm text-red-600 dark:text-red-400 overflow-x-auto whitespace-pre-wrap">
            {expanded ? item.content : item.content!.split('\n')[0]}
            {!expanded && lines.length > 1 && <span className="text-red-500/50 ml-2">({lines.length - 1} more lines)</span>}
          </div>
        )
      
      case 'env':
        const masked = expanded ? item.content! : item.content!.replace(/^([^=#\n]+)=(.+)$/gm, '$1=••••••••')
        return (
          <div className="bg-zinc-50 dark:bg-[#0d1117]">
            <CodeHighlighter code={masked} language="bash" />
          </div>
        )
      
      case 'diff':
        return (
          <div className="bg-zinc-50 dark:bg-[#0d1117]">
            <CodeHighlighter code={displayContent!} language="diff" />
          </div>
        )
      
      case 'curl':
        return (
          <div className="bg-zinc-50 dark:bg-[#0d1117] flex flex-col">
            <div className="p-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-100 dark:bg-zinc-900/50">
              <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">{item.meta?.method || 'GET'} {item.meta?.url}</span>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(curlToFetch(item.meta as any))
                  toast.success('Copied as fetch()')
                }}
                className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 bg-white dark:bg-zinc-800 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition"
              >
                Copy Fetch
              </button>
            </div>
            <CodeHighlighter code={displayContent!} language="bash" />
          </div>
        )
      
      case 'jwt':
        return (
          <div className="bg-zinc-50 dark:bg-[#0d1117] flex flex-col text-sm">
            <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
              {item.meta?.expired ? (
                <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded text-xs font-bold uppercase">Expired</span>
              ) : (
                <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded text-xs font-bold uppercase">Valid</span>
              )}
              {item.meta?.expiresAt && <span className="text-xs text-zinc-500 font-mono">Exp: {item.meta.expiresAt}</span>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-zinc-200 dark:bg-zinc-800">
              <div className="bg-white dark:bg-[#0d1117] p-3">
                <div className="text-[10px] font-bold uppercase text-zinc-400 mb-1">Header</div>
                <CodeHighlighter code={JSON.stringify(item.meta?.header, null, 2)} language="json" />
              </div>
              <div className="bg-white dark:bg-[#0d1117] p-3">
                <div className="text-[10px] font-bold uppercase text-zinc-400 mb-1">Payload</div>
                <CodeHighlighter code={JSON.stringify(item.meta?.payload, null, 2)} language="json" />
              </div>
            </div>
          </div>
        )
      
      case 'timestamp':
        return (
          <div className="p-4 font-mono text-sm flex items-center gap-4 bg-zinc-50 dark:bg-[#0d1117]">
            <div className="font-bold text-amber-600 dark:text-amber-500">{item.meta?.unix}</div>
            <div className="text-zinc-400">→</div>
            <div className="text-zinc-700 dark:text-zinc-300">{item.meta?.iso}</div>
          </div>
        )

      case 'code':
      case 'sql':
      case 'command':
        return (
          <div className="bg-zinc-50 dark:bg-[#0d1117]">
            <CodeHighlighter code={displayContent!} language={item.language || item.type} />
          </div>
        )
      default:
        return (
          <div className="p-4 font-mono text-[14px] text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-words">
            {displayContent}
          </div>
        )
    }
  }

  return (
    <div className={`bg-white dark:bg-zinc-900 border overflow-hidden shadow-sm transition-colors group ${
      item.pinned 
        ? 'border-yellow-400/50 dark:border-yellow-600/50 rounded-lg' 
        : 'border-zinc-200 dark:border-zinc-800/80 rounded-xl hover:border-zinc-300 dark:hover:border-zinc-700'
    }`}>
      {item.pinned && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-500 text-[10px] font-bold uppercase tracking-wider px-3 py-1 border-b border-yellow-100 dark:border-yellow-900/30 flex items-center gap-1">
          <Pin size={12} className="fill-current" /> Pinned
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-100 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/30">
        <div className="flex items-center gap-2">
          <div className={`p-1 rounded ${config.bg} ${config.color}`}>
            <Icon size={14} />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            {item.type} {item.language && <span className="opacity-60 font-medium tracking-normal lowercase ml-1">· {item.language}</span>}
          </span>
          <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 ml-2">
            {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
          </span>
        </div>
        
        <div className="flex items-center gap-1 sm:opacity-0 group-hover:opacity-100 transition-opacity">
          {item.burn_after_read && (
            <span className="px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded text-[10px] font-bold uppercase mr-2 flex items-center gap-1">
              <Flame size={10} /> Consumed
            </span>
          )}
          {!readToken && (
            <button onClick={handlePin} className={`p-1.5 rounded transition ${item.pinned ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-500' : 'hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400'}`} title={item.pinned ? 'Unpin' : 'Pin'}>
              <Pin size={14} className={item.pinned ? 'fill-current' : ''} />
            </button>
          )}
          {item.type !== 'image' && item.content && (
            <button onClick={handleCopy} className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 transition" title="Copy">
              <Copy size={14} />
            </button>
          )}
          {!readToken && (
            <button onClick={() => onDelete(item.id)} className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-950/30 hover:text-red-500 text-zinc-500 transition" title="Delete">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
      
      {renderContent()}

      {item.tags && item.tags.length > 0 && (
        <div className="px-4 py-2 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-[#0a0d12]/50 flex items-center gap-2 flex-wrap">
          <Tag size={12} className="text-zinc-400" />
          {item.tags.map(t => (
            <span key={t} className="px-2 py-0.5 bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-full text-xs">
              {t}
            </span>
          ))}
        </div>
      )}

      {isLong && (item.type !== 'error') && (item.type !== 'env') && (
        <button 
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1 py-1.5 text-[11px] font-semibold tracking-wide uppercase text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 bg-zinc-50/80 dark:bg-[#0a0d12]/80 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition border-t border-zinc-100 dark:border-zinc-800/50"
        >
          {expanded ? <><ChevronUp size={14}/> Collapse</> : <><ChevronDown size={14}/> Expand</>}
        </button>
      )}
      {item.type === 'error' && lines.length > 1 && (
        <button 
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1 py-1.5 text-[11px] font-semibold tracking-wide uppercase text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition border-t border-red-100 dark:border-red-900/30"
        >
          {expanded ? <><ChevronUp size={14}/> Collapse Trace</> : <><ChevronDown size={14}/> Expand Trace</>}
        </button>
      )}
      {item.type === 'env' && (
        <button 
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1 py-1.5 text-[11px] font-semibold tracking-wide uppercase text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 bg-zinc-50/80 dark:bg-[#0a0d12]/80 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition border-t border-zinc-100 dark:border-zinc-800/50"
        >
          {expanded ? <><ChevronUp size={14}/> Hide Values</> : <><ChevronDown size={14}/> Reveal Values</>}
        </button>
      )}
    </div>
  )
}
