const QUEUE_KEY = 'devroom_offline_queue'

export interface QueuedAction {
  id: string
  roomId: string
  content: string
  type: string
  language?: string
  meta?: any
  timestamp: number
  tempId: string
}

export function getOfflineQueue(): QueuedAction[] {
  if (typeof window === 'undefined') return []
  try {
    const data = localStorage.getItem(QUEUE_KEY)
    if (data) return JSON.parse(data)
  } catch (e) {
    // ignore
  }
  return []
}

export function addToOfflineQueue(action: Omit<QueuedAction, 'id' | 'timestamp'>): QueuedAction {
  const queue = getOfflineQueue()
  const fullAction: QueuedAction = {
    ...action,
    id: crypto.randomUUID(),
    timestamp: Date.now()
  }
  queue.push(fullAction)
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch (e) {
    // ignore
  }
  return fullAction
}

export function removeFromOfflineQueue(id: string) {
  const queue = getOfflineQueue().filter(q => q.id !== id)
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch (e) {}
}

export function clearOfflineQueue() {
  try {
    localStorage.removeItem(QUEUE_KEY)
  } catch (e) {}
}
