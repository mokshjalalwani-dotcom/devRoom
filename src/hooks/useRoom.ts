import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Room, Item, listItems, addItem as apiAddItem, deleteItem as apiDeleteItem } from '../lib/api'
import { getOfflineQueue, addToOfflineQueue, removeFromOfflineQueue } from '../lib/offline'
import { ContentType } from '../lib/detector'

export type ConnectionStatus = 'Connected' | 'Connecting' | 'Offline' | 'Error'

export function useRoom(roomId: string, initialRoom: Room | null) {
  const [items, setItems] = useState<Item[]>([])
  const [status, setStatus] = useState<ConnectionStatus>('Connecting')
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const isInitialSyncDone = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const fetchItems = useCallback(async () => {
    try {
      const data = await listItems(roomId)
      setItems(data)
    } catch (e) {
      console.error('Failed to fetch items', e)
    }
  }, [roomId])

  useEffect(() => {
    if (isOnline && isInitialSyncDone.current) {
      const queue = getOfflineQueue()
      const sync = async () => {
        for (const action of queue) {
          if (action.roomId === roomId) {
            try {
              await apiAddItem(action.roomId, action.content, action.type as ContentType, action.language, action.meta)
              removeFromOfflineQueue(action.id)
            } catch (e) {
              console.error('Failed to sync offline item', e)
            }
          }
        }
        await fetchItems()
      }
      sync()
    }
  }, [isOnline, roomId, fetchItems])

  useEffect(() => {
    if (!roomId) return

    const channel = supabase.channel(`room:${roomId}`)
      .on('broadcast', { event: 'item_added' }, ({ payload }) => {
        setItems(prev => {
          if (prev.some(i => i.id === payload.id)) return prev
          return [payload, ...prev].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        })
      })
      .on('broadcast', { event: 'item_deleted' }, ({ payload }) => {
        setItems(prev => prev.filter(i => i.id !== payload.id))
      })
      .on('broadcast', { event: 'room_deleted' }, () => {
        window.location.href = '/' // redirect on delete
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setStatus('Connected')
          fetchItems().then(() => {
            isInitialSyncDone.current = true
          })
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setStatus(isOnline ? 'Error' : 'Offline')
        } else {
          setStatus('Connecting')
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId, fetchItems, isOnline])

  const addItem = async (content: string, type: ContentType, language?: string, meta?: any) => {
    const tempId = crypto.randomUUID()
    const optimisticItem: Item = {
      id: tempId,
      room_id: roomId,
      content,
      type,
      language,
      meta,
      created_at: new Date().toISOString()
    }

    setItems(prev => [optimisticItem, ...prev])

    if (!isOnline) {
      addToOfflineQueue({ roomId, content, type, language, meta, tempId })
      return
    }

    try {
      const newItem = await apiAddItem(roomId, content, type, language, meta)
      setItems(prev => prev.map(i => i.id === tempId ? newItem : i))
      supabase.channel(`room:${roomId}`).send({
        type: 'broadcast',
        event: 'item_added',
        payload: newItem
      })
    } catch (e) {
      console.error('Add item failed', e)
      setItems(prev => prev.filter(i => i.id !== tempId))
      throw e
    }
  }

  const removeItem = async (itemId: string) => {
    const oldItems = [...items]
    setItems(prev => prev.filter(i => i.id !== itemId))
    try {
      await apiDeleteItem(roomId, itemId)
      supabase.channel(`room:${roomId}`).send({
        type: 'broadcast',
        event: 'item_deleted',
        payload: { id: itemId }
      })
    } catch (e) {
      console.error('Delete failed', e)
      setItems(oldItems)
      throw e
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onFocus = () => {
      if (status === 'Connected') fetchItems()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [status, fetchItems])

  return { items, status: isOnline ? status : 'Offline', addItem, removeItem }
}
