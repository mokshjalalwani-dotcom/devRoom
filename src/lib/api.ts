/**
 * src/lib/api.ts – v2
 * Client-side Supabase RPC wrappers.
 * Room creation now goes through /api/rooms (server route) for Turnstile.
 * All v1 functions kept intact; new v2 functions added.
 */
import { supabase } from './supabase'
import { ContentType } from './detector'

export interface Room {
  id: string
  created_at?: string
  expires_at: string
  ttl_seconds?: number
  extended?: boolean
  read_token?: string
  is_encrypted?: boolean
  passcode_hash?: string  // never used client-side; just for TS completeness
}

export interface Item {
  id: string
  room_id: string
  content: string | null       // null when burn_after_read + not consumed
  type: ContentType
  language?: string
  meta?: any
  created_at: string
  pinned?: boolean
  tags?: string[]
  burn_after_read?: boolean
  content_hidden?: boolean     // true when burn-after-read and not yet consumed
}

// ─── Room CRUD ───────────────────────────────────────────────────

/**
 * Create a room via the server API route (verifies Turnstile).
 */
export async function createRoom(
  ttlSeconds: number = 86400,
  options: {
    turnstileToken?: string
    passcode?: string
    encrypted?: boolean
  } = {}
): Promise<Room> {
  const res = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ttlSeconds,
      turnstileToken: options.turnstileToken,
      passcode: options.passcode || null,
      encrypted: options.encrypted || false
    })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error || 'Failed to create room')
  }
  return res.json()
}

export async function getRoom(id: string, passcode?: string): Promise<Room> {
  const { data, error } = await supabase.rpc('get_room', {
    p_id: id,
    p_passcode: passcode || null
  })
  if (error) throw new Error(error.message)
  return data
}

export async function deleteRoom(roomId: string, passcode?: string): Promise<void> {
  const { error } = await supabase.rpc('delete_room', {
    p_room_id: roomId,
    p_passcode: passcode || null
  })
  if (error) throw new Error(error.message)
}

export async function extendRoom(roomId: string, passcode?: string): Promise<Room> {
  const { data, error } = await supabase.rpc('extend_room', {
    p_room_id: roomId,
    p_passcode: passcode || null
  })
  if (error) throw new Error(error.message)
  return data
}

// ─── Items ───────────────────────────────────────────────────────

export async function listItems(roomId: string, passcode?: string): Promise<Item[]> {
  const { data, error } = await supabase.rpc('list_items', {
    p_room_id: roomId,
    p_passcode: passcode || null
  })
  if (error) throw new Error(error.message)
  return data as Item[]
}

export async function addItem(
  roomId: string,
  content: string,
  type: ContentType,
  language?: string,
  meta?: any,
  options: {
    passcode?: string
    burnAfterRead?: boolean
    tags?: string[]
  } = {}
): Promise<Item> {
  const { data, error } = await supabase.rpc('add_item', {
    p_room_id: roomId,
    p_content: content,
    p_type: type,
    p_language: language || null,
    p_meta: meta || null,
    p_passcode: options.passcode || null,
    p_burn_after_read: options.burnAfterRead || false,
    p_tags: options.tags || []
  })
  if (error) throw new Error(error.message)
  return data as Item
}

export async function deleteItem(roomId: string, itemId: string, passcode?: string): Promise<void> {
  const { error } = await supabase.rpc('delete_item', {
    p_room_id: roomId,
    p_item_id: itemId,
    p_passcode: passcode || null
  })
  if (error) throw new Error(error.message)
}

export async function pinItem(roomId: string, itemId: string, pinned: boolean, passcode?: string): Promise<void> {
  const { error } = await supabase.rpc('pin_item', {
    p_room_id: roomId,
    p_item_id: itemId,
    p_pinned: pinned,
    p_passcode: passcode || null
  })
  if (error) throw new Error(error.message)
}

export async function updateItemTags(roomId: string, itemId: string, tags: string[], passcode?: string): Promise<void> {
  const { error } = await supabase.rpc('update_item_tags', {
    p_room_id: roomId,
    p_item_id: itemId,
    p_tags: tags,
    p_passcode: passcode || null
  })
  if (error) throw new Error(error.message)
}

export async function consumeItem(roomId: string, itemId: string, passcode?: string): Promise<string> {
  const { data, error } = await supabase.rpc('consume_item', {
    p_room_id: roomId,
    p_item_id: itemId,
    p_passcode: passcode || null
  })
  if (error) throw new Error(error.message)
  return data as string
}

// ─── Read-only views ─────────────────────────────────────────────

export async function getRoomByReadToken(token: string): Promise<Pick<Room, 'id' | 'expires_at' | 'ttl_seconds' | 'is_encrypted'>> {
  const { data, error } = await supabase.rpc('get_room_by_read_token', { p_token: token })
  if (error) throw new Error(error.message)
  if (!data || !data.length) throw new Error('Room not found')
  return data[0]
}

export async function listItemsByReadToken(token: string): Promise<Item[]> {
  const { data, error } = await supabase.rpc('list_items_by_read_token', { p_token: token })
  if (error) throw new Error(error.message)
  return data as Item[]
}

// ─── Image URL helpers ───────────────────────────────────────────

export async function getFileUrl(
  itemId: string,
  options: { roomId?: string; readToken?: string; variant?: 'thumb' | 'full'; passcode?: string }
): Promise<string> {
  const res = await fetch('/api/file-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      itemId,
      roomId: options.roomId || null,
      readToken: options.readToken || null,
      variant: options.variant || 'thumb',
      passcode: options.passcode || null
    })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed' }))
    throw new Error(err.error || 'Failed to get file URL')
  }
  const { signedUrl } = await res.json()
  return signedUrl
}

// ─── Export helpers ──────────────────────────────────────────────

export function exportAsMarkdown(items: Item[], roomId: string): string {
  const lines: string[] = [
    `# Dev Room: ${roomId}`,
    `Exported: ${new Date().toUTCString()}`,
    ''
  ]
  for (const item of [...items].reverse()) {
    const ts = new Date(item.created_at).toLocaleString()
    const lang = item.language || item.type
    lines.push(`## [${item.type.toUpperCase()}] ${ts}`)
    if (item.type === 'image') {
      lines.push(`*Image: ${item.meta?.path || 'unknown'}*`)
    } else if (item.content) {
      lines.push(`\`\`\`${lang}`)
      lines.push(item.content)
      lines.push('```')
    }
    if (item.tags?.length) lines.push(`Tags: ${item.tags.join(', ')}`)
    lines.push('')
  }
  return lines.join('\n')
}

export function exportAsJson(items: Item[], roomId: string): string {
  return JSON.stringify({ roomId, exportedAt: new Date().toISOString(), items }, null, 2)
}
