'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getRoom, deleteRoom, Room } from '@/lib/api'
import { useRoom } from '@/hooks/useRoom'
import { RoomHeader } from '@/components/RoomHeader'
import { PasteBox } from '@/components/PasteBox'
import { Timeline } from '@/components/Timeline'
import { use } from 'react'

export default function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const id = resolvedParams.id

  const [initialRoom, setInitialRoom] = useState<Room | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    getRoom(id)
      .then(r => {
        setInitialRoom(r)
        try {
          const recent = JSON.parse(localStorage.getItem('devroom_recent') || '[]')
          const filtered = recent.filter((x: any) => x.id !== r.id)
          filtered.unshift({ id: r.id, expires_at: r.expires_at })
          localStorage.setItem('devroom_recent', JSON.stringify(filtered.slice(0, 5)))
        } catch {}
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [id])

  const { items, status, addItem, removeItem } = useRoom(initialRoom ? id : '', initialRoom)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse flex gap-2">
          <div className="w-3 h-3 bg-zinc-300 dark:bg-zinc-700 rounded-full animate-bounce"></div>
          <div className="w-3 h-3 bg-zinc-300 dark:bg-zinc-700 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
          <div className="w-3 h-3 bg-zinc-300 dark:bg-zinc-700 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
        </div>
      </div>
    )
  }

  if (error || !initialRoom) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 text-zinc-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold mb-2 text-zinc-900 dark:text-zinc-100">Room expired or not found</h1>
        <p className="text-zinc-500 mb-8 max-w-sm">This room doesn't exist anymore. Rooms are automatically deleted after they expire.</p>
        <button 
          onClick={() => router.push('/')}
          className="bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 px-6 py-2.5 rounded-lg font-bold transition shadow-sm"
        >
          Create a new room
        </button>
      </div>
    )
  }

  const handleDeleteRoom = async () => {
    try {
      await deleteRoom(id)
      router.push('/')
    } catch (e) {
      // Error handled silently, user can try again
    }
  }

  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 min-h-screen">
      <RoomHeader room={initialRoom} status={status} onDeleteRoom={handleDeleteRoom} />
      
      <div className="bg-orange-50/50 dark:bg-orange-500/10 border border-orange-200/50 dark:border-orange-500/20 text-orange-800 dark:text-orange-400 px-4 py-3 rounded-xl mb-6 text-[13px] font-medium flex items-center gap-3">
        <svg className="w-5 h-5 flex-shrink-0 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span>Don't paste production secrets or credentials. <strong className="font-semibold">Anyone with the URL can view this room.</strong></span>
      </div>

      <PasteBox onAdd={addItem} />
      
      <Timeline items={items} onDelete={removeItem} />
    </main>
  )
}
