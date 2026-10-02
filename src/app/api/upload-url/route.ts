/**
 * POST /api/upload-url
 * Generates signed upload URLs for original + thumbnail.
 * Verifies room, limits, kill switch. Uses service-role key only.
 */
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { createStorage } from '@/lib/storage'
import { SIGNED_URL_TTL_SECONDS, STORAGE_SOFT_CAP_BYTES_DEFAULT, RATE_UPLOADS_PER_HOUR } from '@/lib/limits'

const BUCKET = 'room-files'

function getClientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '0.0.0.0'
  )
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { roomId, size, mimeType, passcode } = body

    if (!roomId || !size || !mimeType) {
      return NextResponse.json({ error: 'roomId, size, and mimeType required' }, { status: 400 })
    }

    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
    if (!allowed.includes(mimeType)) {
      return NextResponse.json({ error: 'Only PNG, JPEG, WebP, GIF allowed' }, { status: 400 })
    }

    if (size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 2 MB after compression)' }, { status: 413 })
    }

    const ip = getClientIp(req)
    const supabase = createServiceClient()
    const storage = createStorage(supabase)

    // Per-IP upload rate limit
    const { count } = await supabase
      .from('rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('ip', ip)
      .eq('action', 'upload')
      .gte('created_at', new Date(Date.now() - 3600_000).toISOString())

    if ((count ?? 0) >= RATE_UPLOADS_PER_HOUR) {
      return NextResponse.json({ error: 'Upload rate limit exceeded (20/hour)' }, { status: 429 })
    }

    // Verify room and passcode via RPC
    const { error: roomErr } = await supabase.rpc('get_room', {
      p_id: roomId,
      p_passcode: passcode || null
    })

    if (roomErr) {
      return NextResponse.json({ error: roomErr.message }, { status: 403 })
    }

    // Check encrypted rooms – image upload not allowed
    const { data: roomData } = await supabase
      .from('rooms')
      .select('is_encrypted')
      .eq('id', roomId)
      .single()

    if (roomData?.is_encrypted) {
      return NextResponse.json({ error: 'Encrypted rooms cannot upload images' }, { status: 400 })
    }

    // Generate paths
    const uuid = crypto.randomUUID()
    const path = `${roomId}/${uuid}.webp`
    const thumbPath = `${roomId}/${uuid}.thumb.webp`

    const softCap = parseInt(process.env.STORAGE_SOFT_CAP_BYTES || String(STORAGE_SOFT_CAP_BYTES_DEFAULT))

    // Register pending upload in DB (validates kill switch + room limits)
    const pendingId = crypto.randomUUID()
    const { error: regErr } = await supabase.rpc('register_file_upload', {
      p_room_id: roomId,
      p_pending_id: pendingId,
      p_path: path,
      p_thumb_path: thumbPath,
      p_size_bytes: size,
      p_soft_cap: softCap
    })

    if (regErr) {
      const status = regErr.message.includes('full') ? 507 : 400
      return NextResponse.json({ error: regErr.message }, { status })
    }

    // Generate signed upload URLs
    const [orig, thumb] = await Promise.all([
      storage.createUploadUrl(BUCKET, path, SIGNED_URL_TTL_SECONDS * 10),
      storage.createUploadUrl(BUCKET, thumbPath, SIGNED_URL_TTL_SECONDS * 10)
    ])

    // Record upload rate limit
    await supabase.from('rate_limits').insert({ ip, action: 'upload' })

    return NextResponse.json({
      pendingId,
      original: { signedUrl: orig.signedUrl, path: orig.path },
      thumbnail: { signedUrl: thumb.signedUrl, path: thumb.path }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
