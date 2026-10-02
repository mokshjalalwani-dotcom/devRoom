'use client'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'

interface Props {
  isOpen: boolean
  secretNames: string[]
  onConfirm: () => void
  onCancel: () => void
}

export function SecretWarningDialog({ isOpen, secretNames, onConfirm, onCancel }: Props) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="bg-white dark:bg-zinc-900 border border-orange-500/30 rounded-xl p-6 max-w-md w-full shadow-2xl"
          >
            <div className="flex items-center gap-3 text-orange-500 mb-4">
              <AlertTriangle size={24} />
              <h2 className="text-xl font-semibold">Possible Secrets Detected</h2>
            </div>
            <p className="text-zinc-600 dark:text-zinc-400 mb-4 leading-relaxed">
              We noticed the following sensitive information in your paste:
            </p>
            <ul className="list-disc list-inside mb-6 text-zinc-800 dark:text-zinc-200 font-medium">
              {secretNames.map((name, i) => (
                <li key={i}>{name}</li>
              ))}
            </ul>
            <p className="text-sm text-zinc-500 dark:text-zinc-500 mb-6">
              Anyone with the room URL can read this. Are you sure you want to add it?
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={onCancel} className="px-4 py-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition font-medium">
                Cancel
              </button>
              <button onClick={onConfirm} className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition font-medium">
                Add Anyway
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
