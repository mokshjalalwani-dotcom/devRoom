'use client'
import { useState } from 'react'
import { Room } from '../lib/api'
import { useCountdown } from '../hooks/useCountdown'
import { ConnectionStatus } from '../hooks/useRoom'
import { Copy, Trash2, Link as LinkIcon, Timer } from 'lucide-react'
import { toast } from './Toast'
import { ConfirmDialog } from './ConfirmDialog'
import { ThemeToggle } from './ThemeToggle'

interface Props {
  room: Room
  status: ConnectionStatus
  onDeleteRoom: () => void
}

export function RoomHeader({ room, status, onDeleteRoom }: Props) {
  const timeLeft = useCountdown(room.expires_at)
  const [showConfirm, setShowConfirm] = useState(false)

  const copyUrl = () => {
    navigator.clipboard.writeText(window.location.href)
    toast.success('Room URL copied')
  }

  const copyId = () => {
    navigator.clipboard.writeText(room.id)
    toast.success('Room ID copied')
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
              <button onClick={copyId} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition" title="Copy ID">
                <Copy size={16} />
              </button>
              <button onClick={copyUrl} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition" title="Copy URL">
                <LinkIcon size={16} />
              </button>
            </div>
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
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          <ThemeToggle />
          <button 
            onClick={() => setShowConfirm(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition text-sm font-semibold"
          >
            <Trash2 size={16} />
            <span className="hidden sm:inline">Delete Room</span>
          </button>
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
