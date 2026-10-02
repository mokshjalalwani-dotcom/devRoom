import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

export async function POST(req: Request) {
  try {
    const { roomId, pendingId, width, height, passcode } = await req.json()
    if (!roomId || !pendingId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    const supabase = createServiceClient()
    
    const { data, error } = await supabase.rpc('add_item_v2', {
      p_room_id: roomId,
      p_passcode: passcode || null,
      p_content: pendingId, // Store the UUID in content for images
      p_type: 'image',
      p_language: null,
      p_meta: { width, height },
      p_tags: [],
      p_burn_after_read: false
    })

    if (error) {
      if (error.message.includes('not found') || error.message.includes('passcode')) {
        return NextResponse.json({ error: error.message }, { status: 403 })
      }
      throw error
    }

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Upload confirm error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
