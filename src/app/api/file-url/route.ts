/**
 * POST /api/file-url
 * Returns a 60-second signed download URL for an image item.
 * Verifies the item belongs to the room.
 */
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { createStorage } from '@/lib/storage'
import { SIGNED_URL_TTL_SECONDS } from '@/lib/limits'

const BUCKET = 'room-files'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { roomId, itemId, variant = 'thumb', passcode, readToken } = body

    if (!itemId || (!roomId && !readToken)) {
      return NextResponse.json({ error: 'itemId and (roomId or readToken) required' }, { status: 400 })
    }

    if (variant !== 'thumb' && variant !== 'full') {
      return NextResponse.json({ error: 'variant must be "thumb" or "full"' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const storage = createStorage(supabase)

    let resolvedRoomId = roomId

    // Support read-token access
    if (!roomId && readToken) {
      const { data, error } = await supabase.rpc('get_room_by_read_token', { p_token: readToken })
      if (error || !data?.length) {
        return NextResponse.json({ error: 'Room not found' }, { status: 404 })
      }
      resolvedRoomId = data[0].id
    } else {
      // Verify room + passcode
      const { error: roomErr } = await supabase.rpc('get_room', {
        p_id: roomId,
        p_passcode: passcode || null
      })
      if (roomErr) return NextResponse.json({ error: roomErr.message }, { status: 403 })
    }

    // Fetch item and verify it belongs to this room
    const { data: items, error: itemErr } = await supabase.rpc('list_items', {
      p_room_id: resolvedRoomId,
      p_passcode: passcode || null
    })

    if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 403 })

    const item = (items || []).find((i: any) => i.id === itemId && i.type === 'image')
    if (!item) return NextResponse.json({ error: 'Image item not found' }, { status: 404 })

    const path = variant === 'thumb' ? item.meta?.thumbPath : item.meta?.path
    if (!path) return NextResponse.json({ error: 'No path in item meta' }, { status: 404 })

    const signedUrl = await storage.createDownloadUrl(BUCKET, path, SIGNED_URL_TTL_SECONDS)

    return NextResponse.json(
      { signedUrl },
      {
        headers: {
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, no-store'
        }
      }
    )
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
