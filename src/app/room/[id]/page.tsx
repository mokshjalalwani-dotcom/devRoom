'use client'
import { useState, useEffect, use } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getRoom, deleteRoom, Room, getRoomByReadToken } from '@/lib/api'
import { useRoom } from '@/hooks/useRoom'
import { RoomHeader } from '@/components/RoomHeader'
import { PasteBox } from '@/components/PasteBox'
import { Timeline } from '@/components/Timeline'
import { ImageUpload } from '@/components/ImageUpload'
import { getKeyFromFragment, importKey } from '@/lib/crypto'
import { toast } from '@/components/Toast'
import { Lock, AlertCircle, Loader2 } from 'lucide-react'

export default function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const id = resolvedParams.id
  const searchParams = useSearchParams()
  const readToken = searchParams.get('read') || undefined

  const [initialRoom, setInitialRoom] = useState<Room | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  
  const [passcode, setPasscode] = useState<string | undefined>(undefined)
  const [needsPasscode, setNeedsPasscode] = useState(false)
  const [passcodeInput, setPasscodeInput] = useState('')
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null)

  const router = useRouter()

  const loadRoom = async (p?: string) => {
    setLoading(true)
    setError(null)
    setNeedsPasscode(false)
    try {
      let r: Room
      if (readToken) {
        r = await getRoomByReadToken(readToken)
      } else {
        r = await getRoom(id, p)
      }
      
      setInitialRoom(r)
      setPasscode(p)
      
      if (r.is_encrypted) {
        const keyB64 = getKeyFromFragment()
        if (keyB64) {
          try {
            const key = await importKey(keyB64)
            setCryptoKey(key)
          } catch {
            setError('Invalid encryption key in URL.')
          }
        } else {
          setError('Missing encryption key in URL.')
        }
      }

      // save to recent (only if not read-only)
      if (!readToken) {
        try {
          const recent = JSON.parse(localStorage.getItem('devroom_recent') || '[]')
          const filtered = recent.filter((x: any) => x.id !== r.id)
          filtered.unshift({ id: r.id, expires_at: r.expires_at, passcode: p })
          localStorage.setItem('devroom_recent', JSON.stringify(filtered.slice(0, 5)))
        } catch {}
      }
    } catch (err: any) {
      if (err.message === 'Wrong passcode') {
        setNeedsPasscode(true)
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  // Try loading initially
  useEffect(() => {
    // maybe we have the passcode in localStorage from recent rooms?
    let savedPasscode: string | undefined
    try {
      const recent = JSON.parse(localStorage.getItem('devroom_recent') || '[]')
      const r = recent.find((x: any) => x.id === id)
      if (r?.passcode) savedPasscode = r.passcode
    } catch {}
    
    loadRoom(savedPasscode)
  }, [id, readToken])

  const { items, status, handleAddItem, handleDeleteItem, setItems } = useRoom(
    initialRoom ? id : '', 
    passcode, 
    readToken, 
    cryptoKey || undefined
  )

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-zinc-400" size={24} />
      </div>
    )
  }

  if (needsPasscode) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-zinc-50 dark:bg-zinc-950">
        <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 text-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm">
          <Lock size={32} />
        </div>
        <h1 className="text-2xl font-bold mb-2 text-zinc-900 dark:text-zinc-100">Passcode Required</h1>
        <p className="text-zinc-500 mb-8 max-w-sm">This room is protected by a passcode.</p>
        
        <form onSubmit={e => { e.preventDefault(); loadRoom(passcodeInput) }} className="w-full max-w-xs flex flex-col gap-3">
          <input 
            type="password"
            autoFocus
            value={passcodeInput}
            onChange={e => setPasscodeInput(e.target.value)}
            placeholder="Enter passcode"
            className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 focus:ring-2 focus:ring-blue-500 outline-none transition text-center font-mono"
          />
          <button type="submit" className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition shadow-sm">
            Unlock Room
          </button>
        </form>
      </div>
    )
  }

  if (error || !initialRoom) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-zinc-50 dark:bg-zinc-950">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm">
          <AlertCircle size={32} />
        </div>
        <h1 className="text-3xl font-bold mb-2 text-zinc-900 dark:text-zinc-100">Room Error</h1>
        <p className="text-zinc-500 mb-8 max-w-sm">{error || "Room expired or not found."}</p>
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
      await deleteRoom(id, passcode)
      router.push('/')
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 min-h-screen">
      <RoomHeader 
        room={initialRoom} 
        status={status} 
        passcode={passcode} 
        readToken={readToken}
        items={items}
        onDeleteRoom={handleDeleteRoom} 
        onRoomExtended={setInitialRoom}
      />
      
      {initialRoom.is_encrypted && !readToken && (
        <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-400 px-4 py-3 rounded-xl mb-6 text-[13px] font-medium flex items-center gap-3">
          <Lock className="w-5 h-5 flex-shrink-0" />
          <span>This room is <strong className="font-bold">End-to-End Encrypted</strong>. The server cannot read your text contents.</span>
        </div>
      )}

      {!readToken && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="md:col-span-2">
            <PasteBox onAdd={handleAddItem} />
          </div>
          <div className="md:col-span-1">
            <ImageUpload 
              roomId={id} 
              passcode={passcode}
              disabled={initialRoom.is_encrypted} 
              onUploaded={async (pendingId, w, h) => {
                // tell the server we're done so it confirms the file and adds an item
                const res = await fetch('/api/upload-confirm', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ roomId: id, pendingId, width: w, height: h, passcode })
                })
                if (!res.ok) {
                  const err = await res.json()
                  throw new Error(err.error || 'Failed to confirm upload')
                }
              }} 
            />
          </div>
        </div>
      )}
      
      <Timeline 
        roomId={id}
        items={items} 
        passcode={passcode}
        readToken={readToken}
        onDelete={handleDeleteItem} 
        onConsumed={(itemId, content) => {
          setItems(prev => prev.map(i => i.id === itemId ? { ...i, content, content_hidden: false } : i))
        }}
        onTagUpdate={(itemId, tags) => {
          setItems(prev => prev.map(i => i.id === itemId ? { ...i, tags } : i))
        }}
        onPinUpdate={(itemId, pinned) => {
          setItems(prev => prev.map(i => i.id === itemId ? { ...i, pinned } : i).sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          }))
        }}
      />
    </main>
  )
}
