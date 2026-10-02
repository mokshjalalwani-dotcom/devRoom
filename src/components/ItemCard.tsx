'use client'
import { useState } from 'react'
import { Item } from '../lib/api'
import { formatDistanceToNow } from 'date-fns'
import { Copy, Trash2, ChevronDown, ChevronUp, Link as LinkIcon, Terminal, Code2, Database, AlertCircle, Key, FileText, Braces } from 'lucide-react'
import { toast } from './Toast'
import { CodeHighlighter } from './Highlighter'

interface Props {
  item: Item
  onDelete: (id: string) => void
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
}

export function ItemCard({ item, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false)
  const config = typeConfig[item.type] || typeConfig.text
  const Icon = config.icon

  const handleCopy = () => {
    navigator.clipboard.writeText(item.content)
    toast.success('Copied to clipboard')
  }

  const lines = item.content.split('\n')
  const isLong = lines.length > 8 || item.content.length > 500
  
  const displayContent = expanded ? item.content : (isLong ? lines.slice(0, 8).join('\n') + (lines.length > 8 ? '\n...' : '') : item.content)

  const renderContent = () => {
    switch (item.type) {
      case 'url':
        return (
          <div className="p-4 bg-zinc-50/50 dark:bg-[#0d1117]/50">
            <a href={item.content} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline break-all font-medium">
              {item.meta?.title || item.content}
            </a>
            {item.meta?.domain && <div className="text-xs text-zinc-500 mt-1">{item.meta.domain}</div>}
          </div>
        )
      case 'json':
        try {
          const parsed = JSON.parse(item.content)
          const pretty = JSON.stringify(parsed, null, 2)
          return (
            <div className="bg-zinc-50 dark:bg-[#0d1117] rounded-b-lg">
              <CodeHighlighter code={expanded ? pretty : pretty.split('\n').slice(0, 8).join('\n') + (pretty.split('\n').length > 8 && !expanded ? '\n...' : '')} language="json" />
            </div>
          )
        } catch {
          return <div className="bg-zinc-50 dark:bg-[#0d1117]"><CodeHighlighter code={displayContent} language="json" /></div>
        }
      case 'error':
        return (
          <div className="p-4 bg-red-50/50 dark:bg-red-950/20 font-mono text-sm text-red-600 dark:text-red-400 overflow-x-auto whitespace-pre-wrap">
            {expanded ? item.content : item.content.split('\n')[0]}
            {!expanded && lines.length > 1 && <span className="text-red-500/50 ml-2">({lines.length - 1} more lines)</span>}
          </div>
        )
      case 'env':
        const masked = expanded ? item.content : item.content.replace(/^([^=#\n]+)=(.+)$/gm, '$1=••••••••')
        return (
          <div className="bg-zinc-50 dark:bg-[#0d1117]">
            <CodeHighlighter code={masked} language="bash" />
          </div>
        )
      case 'code':
      case 'sql':
      case 'command':
        return (
          <div className="bg-zinc-50 dark:bg-[#0d1117]">
            <CodeHighlighter code={displayContent} language={item.language || item.type} />
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
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/80 rounded-xl overflow-hidden shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors group">
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
          <button onClick={handleCopy} className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 transition" title="Copy">
            <Copy size={14} />
          </button>
          <button onClick={() => onDelete(item.id)} className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-950/30 hover:text-red-500 text-zinc-500 transition" title="Delete">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      
      {renderContent()}

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
