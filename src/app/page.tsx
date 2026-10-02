'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createRoom } from '@/lib/api'
import { motion } from 'framer-motion'
import { Clock, ArrowRight, Terminal } from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { toast } from '@/components/Toast'

export default function LandingPage() {
  const router = useRouter()
  const [ttl, setTtl] = useState(86400) // 24h
  const [isCreating, setIsCreating] = useState(false)
  const [joinId, setJoinId] = useState('')
  const [recentRooms, setRecentRooms] = useState<{id: string, expires_at: string}[]>([])

  useEffect(() => {
    try {
      const recent = JSON.parse(localStorage.getItem('devroom_recent') || '[]')
      const valid = recent.filter((r: any) => new Date(r.expires_at).getTime() > Date.now())
      setRecentRooms(valid)
      if (valid.length !== recent.length) {
        localStorage.setItem('devroom_recent', JSON.stringify(valid))
      }
    } catch {}
  }, [])

  const handleCreate = async () => {
    setIsCreating(true)
    try {
      const room = await createRoom(ttl)
      
      const recent = JSON.parse(localStorage.getItem('devroom_recent') || '[]')
      recent.unshift({ id: room.id, expires_at: room.expires_at })
      localStorage.setItem('devroom_recent', JSON.stringify(recent.slice(0, 5)))
      
      router.push(`/room/${room.id}`)
    } catch (e) {
      toast.error('Failed to create room')
      setIsCreating(false)
    }
  }

  const handleJoin = () => {
    if (joinId.trim()) {
      router.push(`/room/${joinId.trim()}`)
    }
  }

  const removeRecent = (id: string) => {
    const valid = recentRooms.filter(r => r.id !== id)
    setRecentRooms(valid)
    localStorage.setItem('devroom_recent', JSON.stringify(valid))
  }

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/5 dark:bg-blue-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-500/5 dark:bg-purple-500/10 blur-[120px] pointer-events-none" />

      <header className="p-4 flex justify-end relative z-10">
        <ThemeToggle />
      </header>
      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-2xl mx-auto w-full relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: 'easeOut' }} className="w-full">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500/20 to-purple-500/20 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-8 border border-blue-500/20 shadow-inner">
            <Terminal size={32} />
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight mb-4 text-zinc-900 dark:text-white">
            Temporal Dev Room
          </h1>
          <p className="text-xl sm:text-2xl font-medium text-zinc-600 dark:text-zinc-300 mb-4 tracking-tight">
            Dump it. Debug it. Forget it.
          </p>
          <p className="text-zinc-500 dark:text-zinc-400 mb-10 max-w-lg mx-auto text-[15px] leading-relaxed">
            A temporary, real-time workspace to share logs, code, JSON, and errors across devices. Zero accounts. Zero history.
          </p>

          <div className="bg-white/80 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-6 shadow-xl shadow-zinc-200/20 dark:shadow-black/20 backdrop-blur-xl max-w-md mx-auto mb-12">
            <div className="flex items-center gap-2 mb-4 text-zinc-700 dark:text-zinc-300 font-semibold text-sm uppercase tracking-wider">
              <Clock size={16} className="text-zinc-400" />
              <span>Room Lifespan</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-6">
              {[ { l: '1 Hour', v: 3600 }, { l: '24 Hours', v: 86400 }, { l: '7 Days', v: 604800 } ].map(opt => (
                <button
                  key={opt.v}
                  onClick={() => setTtl(opt.v)}
                  className={`py-2.5 px-1 text-[13px] font-semibold rounded-lg transition-all duration-200 ${
                    ttl === opt.v 
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 scale-[1.02]' 
                    : 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  {opt.l}
                </button>
              ))}
            </div>
            
            <button
              onClick={handleCreate}
              disabled={isCreating}
              className="group w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 py-3.5 rounded-xl font-bold transition-all disabled:opacity-50 shadow-lg shadow-zinc-900/20 dark:shadow-white/10"
            >
              {isCreating ? 'Creating...' : 'Create Instant Room'}
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>

            <div className="mt-6 pt-6 border-t border-zinc-200 dark:border-zinc-800">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Paste Room ID..." 
                  value={joinId}
                  onChange={(e) => setJoinId(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                  className="flex-1 bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400"
                />
                <button 
                  onClick={handleJoin}
                  disabled={!joinId.trim()}
                  className="bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-5 rounded-xl font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition disabled:opacity-50"
                >
                  Join
                </button>
              </div>
            </div>
          </div>

          {recentRooms.length > 0 && (
            <div className="text-left max-w-md mx-auto">
              <h3 className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-3 px-1">Recent Rooms</h3>
              <div className="space-y-2">
                {recentRooms.map(r => (
                  <div key={r.id} className="flex items-center justify-between p-3.5 rounded-xl bg-white/50 dark:bg-zinc-900/30 border border-zinc-200/50 dark:border-zinc-800/50 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
                    <button onClick={() => router.push(`/room/${r.id}`)} className="flex-1 text-left font-mono text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                      /{r.id}
                    </button>
                    <button onClick={() => removeRecent(r.id)} className="text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 p-1.5 rounded-lg transition-colors text-xs font-medium">
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  )
}
