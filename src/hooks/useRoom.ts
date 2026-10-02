'use client'
import { useState, useEffect, useCallback } from 'react'
import { Item, listItems, addItem, deleteItem, listItemsByReadToken } from '../lib/api'
import { supabase } from '../lib/supabase'
import { getOfflineQueue, addToOfflineQueue, removeFromOfflineQueue, QueuedAction } from '../lib/offline'
import { ContentType } from '../lib/detector'
import { toast } from '../components/Toast'
import { encryptText, decryptText } from '../lib/crypto'

export type ConnectionStatus = 'Connecting' | 'Connected' | 'Disconnected'

export function useRoom(roomId: string, passcode?: string, readToken?: string, cryptoKey?: CryptoKey | null) {
  const [items, setItems] = useState<Item[]>([])
  const [status, setStatus] = useState<ConnectionStatus>('Connecting')
  const [error, setError] = useState<string | null>(null)

  // Hydrate from network (only once on mount)
  useEffect(() => {
    async function load() {
      try {
        let data: Item[]
        if (readToken) {
          data = await listItemsByReadToken(readToken)
        } else {
          data = await listItems(roomId, passcode)
        }

        // Decrypt E2EE items
        if (cryptoKey) {
          data = await Promise.all(data.map(async item => {
            if (item.content && item.type !== 'image') {
              try {
                // we assume payload is stored as JSON in item.content
                const payload = JSON.parse(item.content)
                item.content = await decryptText(cryptoKey, payload)
              } catch {
                item.content = 'Failed to decrypt item'
                item.type = 'error'
              }
            }
            return item
          }))
        }
        
        // merge offline items
        const offline = getOfflineQueue().filter(q => q.roomId === roomId && q.type !== 'delete')
        
        const merged = [...data]
        for (const q of offline) {
          merged.unshift({
            id: q.tempId,
            room_id: roomId,
            content: q.content,
            type: q.type as ContentType,
            language: q.language,
            meta: q.meta,
            created_at: new Date(q.timestamp).toISOString(),
            tags: q.options?.tags || [],
            burn_after_read: q.options?.burnAfterRead || false
          })
        }
        
        setItems(merged)
        setStatus('Connected')
      } catch (err: any) {
        setError(err.message)
        setStatus('Disconnected')
      }
    }
    load()
  }, [roomId, passcode, readToken, cryptoKey])

  // Real-time subscription (skip if read-only)
  useEffect(() => {
    if (!roomId || readToken) return
    setStatus('Connecting')

    const channel = supabase.channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items', filter: `room_id=eq.${roomId}` },
        async payload => {
          if (payload.eventType === 'INSERT') {
            const newItem = payload.new as Item
            if (cryptoKey && newItem.content && newItem.type !== 'image') {
              try {
                const encPayload = JSON.parse(newItem.content)
                newItem.content = await decryptText(cryptoKey, encPayload)
              } catch {
                newItem.content = 'Failed to decrypt item'
                newItem.type = 'error'
              }
            }
            // avoid dupes from offline sync
            setItems(prev => {
              if (prev.some(i => i.id === newItem.id)) return prev
              return [newItem, ...prev].sort((a, b) => {
                if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
              })
            })
          }
          if (payload.eventType === 'DELETE') {
            setItems(prev => prev.filter(i => i.id !== payload.old.id))
          }
          if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Item
            if (cryptoKey && updated.content && updated.type !== 'image') {
              try {
                const encPayload = JSON.parse(updated.content)
                updated.content = await decryptText(cryptoKey, encPayload)
              } catch {
                updated.content = 'Failed to decrypt item'
                updated.type = 'error'
              }
            }
            setItems(prev => prev.map(i => i.id === updated.id ? updated : i).sort((a, b) => {
              if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            }))
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setStatus('Connected')
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR') setStatus('Disconnected')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId, readToken, cryptoKey])

  // Sync offline queue when coming back online
  useEffect(() => {
    const sync = async () => {
      if (!navigator.onLine || readToken) return
      const queue = getOfflineQueue().filter(q => q.roomId === roomId)
      for (const action of queue) {
        try {
          if (action.actionType === 'delete') {
            await deleteItem(roomId, action.tempId, passcode)
          } else {
            // content should already be encrypted in the offline queue if needed
            await addItem(roomId, action.content, action.type as ContentType, action.language, action.meta, {
              passcode,
              tags: action.options?.tags,
              burnAfterRead: action.options?.burnAfterRead
            })
          }
          removeFromOfflineQueue(action.id)
        } catch (e) {
          // keep in queue if it failed (unless it's a permanent error like wrong passcode, but we ignore for simplicity)
        }
      }
    }
    
    window.addEventListener('online', sync)
    // Try syncing immediately just in case
    sync()
    return () => window.removeEventListener('online', sync)
  }, [roomId, passcode, readToken])

  const handleAddItem = useCallback(async (
    content: string, 
    type: ContentType, 
    language?: string, 
    meta?: any, 
    options?: { tags?: string[], burnAfterRead?: boolean }
  ) => {
    if (readToken) throw new Error('Cannot add items in read-only mode')

    let finalContent = content
    if (cryptoKey && type !== 'image') {
      const encrypted = await encryptText(cryptoKey, content)
      finalContent = JSON.stringify(encrypted)
    }

    if (!navigator.onLine) {
      const tempId = crypto.randomUUID()
      addToOfflineQueue({
        roomId,
        actionType: 'add',
        content: finalContent,
        type,
        language,
        meta,
        tempId,
        options
      })
      
      const optimisticItem: Item = {
        id: tempId,
        room_id: roomId,
        content: content, // UI needs plain text
        type,
        language,
        meta,
        created_at: new Date().toISOString(),
        tags: options?.tags || [],
        burn_after_read: options?.burnAfterRead || false,
        pinned: false
      }
      setItems(prev => [optimisticItem, ...prev])
      toast.success('Saved offline. Will sync when reconnected.')
      return
    }

    await addItem(roomId, finalContent, type, language, meta, {
      passcode,
      tags: options?.tags,
      burnAfterRead: options?.burnAfterRead
    })
  }, [roomId, passcode, readToken, cryptoKey])

  const handleDeleteItem = useCallback(async (id: string) => {
    if (readToken) return

    setItems(prev => prev.filter(i => i.id !== id))
    
    if (!navigator.onLine) {
      addToOfflineQueue({
        roomId,
        actionType: 'delete',
        content: '',
        type: 'text',
        tempId: id
      })
      return
    }
    
    try {
      await deleteItem(roomId, id, passcode)
    } catch (e: any) {
      toast.error('Failed to delete item')
      // rollback (naive)
      const data = await listItems(roomId, passcode)
      setItems(data)
    }
  }, [roomId, passcode, readToken])

  return { items, setItems, status, error, handleAddItem, handleDeleteItem }
}
