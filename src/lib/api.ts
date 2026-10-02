import { supabase } from './supabase'
import { generateRoomId } from './id'
import { ContentType } from './detector'

export interface Room {
  id: string
  created_at: string
  expires_at: string
}

export interface Item {
  id: string
  room_id: string
  content: string
  type: ContentType
  language?: string
  meta?: any
  created_at: string
}

export async function createRoom(ttlSeconds: number = 86400): Promise<Room> {
  const id = generateRoomId()
  const { data, error } = await supabase.rpc('create_room', {
    p_id: id,
    p_ttl_seconds: ttlSeconds
  })

  if (error) throw new Error(error.message)
  return data
}

export async function getRoom(id: string): Promise<Room> {
  const { data, error } = await supabase.rpc('get_room', { p_id: id })
  if (error) throw new Error(error.message)
  return data
}

export async function listItems(roomId: string): Promise<Item[]> {
  const { data, error } = await supabase.rpc('list_items', { p_room_id: roomId })
  if (error) throw new Error(error.message)
  return data as Item[]
}

export async function addItem(
  roomId: string,
  content: string,
  type: ContentType,
  language?: string,
  meta?: any
): Promise<Item> {
  const { data, error } = await supabase.rpc('add_item', {
    p_room_id: roomId,
    p_content: content,
    p_type: type,
    p_language: language || null,
    p_meta: meta || null
  })
  
  if (error) throw new Error(error.message)
  return data as Item
}

export async function deleteItem(roomId: string, itemId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_item', {
    p_room_id: roomId,
    p_item_id: itemId
  })
  if (error) throw new Error(error.message)
}

export async function deleteRoom(roomId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_room', { p_room_id: roomId })
  if (error) throw new Error(error.message)
}
