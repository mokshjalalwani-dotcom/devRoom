'use client'
import { useState } from 'react'
import { Room, extendRoom, exportAsMarkdown, exportAsJson } from '../lib/api'
import { useCountdown } from '../hooks/useCountdown'
import { ConnectionStatus } from '../hooks/useRoom'
import { Copy, Trash2, Link as LinkIcon, Timer, Plus, Share2, Download, Check } from 'lucide-react'
import { toast } from './Toast'
import { ConfirmDialog } from './ConfirmDialog'
import { ThemeToggle } from './ThemeToggle'

interface Props {
  room: Room
  status: ConnectionStatus
  passcode?: string
  readToken?: string
  items?: any[]
  onDeleteRoom: () => void
  onRoomExtended?: (room: Room) => void
}

export function RoomHeader({ room, status, passcode, readToken, items = [], onDeleteRoom, onRoomExtended }: Props) {
  const timeLeft = useCountdown(room.expires_at)
  const [showConfirm, setShowConfirm] = useState(false)
  const [extending, setExtending] = useState(false)

  const copyUrl = () => {
    navigator.clipboard.writeText(window.location.href)
    toast.success('Room URL copied')
  }

  const copyReadOnlyUrl = () => {
    if (!room.read_token) return
    const url = new URL(window.location.href)
    url.searchParams.set('read', room.read_token)
    navigator.clipboard.writeText(url.toString())
    toast.success('Read-only URL copied')
  }

  const handleExtend = async () => {
    if (extending || room.extended || readToken) return
    setExtending(true)
    try {
      const updated = await extendRoom(room.id, passcode)
      toast.success('Room lifetime extended')
      if (onRoomExtended) onRoomExtended(updated)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setExtending(false)
    }
  }

  const handleExport = (format: 'md' | 'json') => {
    const content = format === 'md' ? exportAsMarkdown(items, room.id) : exportAsJson(items, room.id)
    const blob = new Blob([content], { type: format === 'md' ? 'text/markdown' : 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `devroom-${room.id}.${format}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 py-4 mb-6">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-mono tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <span className="text-blue-500 font-normal">/</span>
              {room.id}
            </h1>
            <div className="flex gap-1">
              <button onClick={copyUrl} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition" title="Copy URL">
                <LinkIcon size={16} />
              </button>
              {!readToken && room.read_token && (
                <button onClick={copyReadOnlyUrl} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition flex items-center gap-1" title="Copy Read-Only Link">
                  <Share2 size={16} />
                </button>
              )}
            </div>
            {readToken && (
              <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400 text-[10px] font-bold uppercase rounded tracking-wider">
                Read Only
              </span>
            )}
            {room.is_encrypted && (
              <span className="px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 text-[10px] font-bold uppercase rounded tracking-wider">
                E2E Encrypted
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-4 text-sm font-medium text-zinc-500">
            <div className="flex items-center gap-2">
              <div className="relative flex h-2.5 w-2.5">
                {status === 'Connected' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  status === 'Connected' ? 'bg-emerald-500' : 
                  status === 'Connecting' ? 'bg-yellow-500' : 'bg-red-500'
                }`}></span>
              </div>
              {status}
            </div>
            <div className="flex items-center gap-1.5">
              <Timer size={14} className="opacity-70" />
              Expires in {timeLeft}
              
              {!readToken && !room.extended && (
                <button 
                  onClick={handleExtend}
                  disabled={extending}
                  className="ml-2 text-xs flex items-center gap-1 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800/50 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition disabled:opacity-50"
                  title="Extend time by initial TTL"
                >
                  <Plus size={10} /> Extend
                </button>
              )}
              {!readToken && room.extended && (
                <span className="ml-2 text-xs flex items-center gap-1 text-zinc-400" title="Already extended once">
                  <Check size={10} /> Extended
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          <ThemeToggle />
          
          <div className="flex items-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden shadow-sm">
            <button onClick={() => handleExport('md')} className="px-3 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition flex items-center gap-1" title="Export Markdown">
              <Download size={14} /> MD
            </button>
            <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800"></div>
            <button onClick={() => handleExport('json')} className="px-3 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition" title="Export JSON">
              JSON
            </button>
          </div>

          {!readToken && (
            <button 
              onClick={() => setShowConfirm(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition text-sm font-semibold"
            >
              <Trash2 size={16} />
              <span className="hidden sm:inline">Delete Room</span>
            </button>
          )}
        </div>
      </header>

      <ConfirmDialog
        isOpen={showConfirm}
        title="Delete Room"
        message="This will permanently delete the room and all its contents for everyone. This cannot be undone."
        confirmText="Delete Room"
        onConfirm={() => {
          setShowConfirm(false)
          onDeleteRoom()
        }}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  )
}
