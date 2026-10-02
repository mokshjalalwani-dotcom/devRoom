'use client'
import { useState, useMemo } from 'react'
import { ItemCard } from './ItemCard'
import { Item } from '../lib/api'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Filter, X } from 'lucide-react'

interface Props {
  roomId: string
  items: Item[]
  passcode?: string
  readToken?: string
  onDelete: (id: string) => void
  onConsumed?: (id: string, content: string) => void
  onTagUpdate?: (id: string, tags: string[]) => void
  onPinUpdate?: (id: string, pinned: boolean) => void
}

const typeColor: Record<string, string> = {
  url: 'bg-blue-500 ring-blue-500/20',
  json: 'bg-yellow-500 ring-yellow-500/20',
  sql: 'bg-indigo-500 ring-indigo-500/20',
  command: 'bg-emerald-500 ring-emerald-500/20',
  error: 'bg-red-500 ring-red-500/20',
  code: 'bg-purple-500 ring-purple-500/20',
  env: 'bg-cyan-500 ring-cyan-500/20',
  text: 'bg-zinc-400 dark:bg-zinc-600 ring-zinc-500/20',
  image: 'bg-pink-500 ring-pink-500/20',
  log: 'bg-orange-500 ring-orange-500/20',
  diff: 'bg-lime-500 ring-lime-500/20',
  markdown: 'bg-sky-500 ring-sky-500/20',
  curl: 'bg-emerald-500 ring-emerald-500/20',
  jwt: 'bg-violet-500 ring-violet-500/20',
  timestamp: 'bg-amber-500 ring-amber-500/20',
  base64: 'bg-slate-500 ring-slate-500/20',
}

export function Timeline({ roomId, items, passcode, readToken, onDelete, onConsumed, onTagUpdate, onPinUpdate }: Props) {
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<string | null>(null)

  // Extract all unique types and tags for filters
  const availableTypes = useMemo(() => Array.from(new Set(items.map(i => i.type))), [items])
  
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // type filter
      if (filterType && item.type !== filterType) return false
      // search filter (matches content, tags, type, language)
      if (search) {
        const s = search.toLowerCase()
        const matchesContent = item.content?.toLowerCase().includes(s)
        const matchesTag = item.tags?.some(t => t.toLowerCase().includes(s))
        const matchesType = item.type.toLowerCase().includes(s)
        const matchesLang = item.language?.toLowerCase().includes(s)
        if (!matchesContent && !matchesTag && !matchesType && !matchesLang) return false
      }
      return true
    })
  }, [items, search, filterType])

  return (
    <div className="flex flex-col gap-4">
      {items.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-2 bg-white dark:bg-zinc-900 p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search items, tags..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-zinc-50 dark:bg-zinc-950 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500 dark:text-zinc-200"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
            <Filter size={16} className="text-zinc-400 hidden sm:block ml-2" />
            <div className="flex gap-1">
              <button
                onClick={() => setFilterType(null)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${!filterType ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'}`}
              >
                All
              </button>
              {availableTypes.map(t => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap uppercase tracking-wider transition-colors ${filterType === t ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="py-24 text-center text-zinc-500 dark:text-zinc-500">
          <div className="mb-4 opacity-50 flex justify-center">
            <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <p className="font-medium">Nothing here yet. Paste something above.</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="py-12 text-center text-zinc-500">
          No items match your search.
        </div>
      ) : (
        <div className="relative pt-4 pb-20">
          <div className="absolute left-6 md:left-8 top-0 bottom-0 w-px bg-zinc-200 dark:bg-zinc-800" />
          <div className="space-y-6">
            <AnimatePresence initial={false}>
              {filteredItems.map(item => {
                const dotColor = typeColor[item.type] || typeColor.text
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: -20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                    transition={{ duration: 0.3 }}
                    className="relative pl-12 md:pl-16 pr-2"
                  >
                    <div className={`absolute left-[20.5px] md:left-[28.5px] top-[22px] w-2.5 h-2.5 rounded-full ${dotColor} ring-4 ring-zinc-50 dark:ring-zinc-950`} />
                    <ItemCard 
                      item={item} 
                      roomId={roomId}
                      passcode={passcode}
                      readToken={readToken}
                      onDelete={onDelete}
                      onConsumed={onConsumed}
                      onTagUpdate={onTagUpdate}
                      onPinUpdate={onPinUpdate}
                    />
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  )
}
