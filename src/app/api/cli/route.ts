import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { detectContent } from '@/lib/detector'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { roomId, content, passcode, tags } = body
    if (!roomId || !content) {
      return NextResponse.json({ error: 'Missing roomId or content' }, { status: 400 })
    }

    const { type, language, meta } = detectContent(content)
    
    const supabase = createServiceClient()
    const { data, error } = await supabase.rpc('add_item_v2', {
      p_room_id: roomId,
      p_passcode: passcode || null,
      p_content: content,
      p_type: type,
      p_language: language || null,
      p_meta: meta || null,
      p_tags: tags || [],
      p_burn_after_read: false
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, item: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
