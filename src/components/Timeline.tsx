'use client'
import { ItemCard } from './ItemCard'
import { Item } from '../lib/api'
import { motion, AnimatePresence } from 'framer-motion'

interface Props {
  items: Item[]
  onDelete: (id: string) => void
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
}

export function Timeline({ items, onDelete }: Props) {
  if (items.length === 0) {
    return (
      <div className="py-24 text-center text-zinc-500 dark:text-zinc-500">
        <div className="mb-4 opacity-50 flex justify-center">
          <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        </div>
        <p className="font-medium">Nothing here yet. Paste something above.</p>
      </div>
    )
  }

  return (
    <div className="relative pt-6 pb-20">
      <div className="absolute left-6 md:left-8 top-0 bottom-0 w-px bg-zinc-200 dark:bg-zinc-800" />
      <div className="space-y-6">
        <AnimatePresence initial={false}>
          {items.map(item => {
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
                <div className={`absolute left-[20.5px] md:left-[28.5px] top-[22px] w-2.5 h-2.5 rounded-full ${dotColor} ring-4 ring-white dark:ring-zinc-950`} />
                <ItemCard item={item} onDelete={onDelete} />
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
