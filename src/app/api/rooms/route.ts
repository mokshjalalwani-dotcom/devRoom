/**
 * POST /api/rooms
 * Creates a room. Verifies Cloudflare Turnstile token server-side.
 * Uses service-role key — never exposes it to the browser.
 */
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { generateRoomId } from '@/lib/id'
import { ALLOWED_TTLS, RATE_ROOMS_PER_HOUR, RATE_ROOMS_PER_HOUR_CLI } from '@/lib/limits'

const BUCKET = 'room-files'

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  // If no secret configured, skip verification (dev mode)
  if (!secret || secret === 'dev') return true

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, response: token, remoteip: ip })
  })
  const data = await res.json()
  return data.success === true
}

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
    const { ttlSeconds = 86400, turnstileToken, passcode, encrypted = false, clientType } = body

    // Validate TTL
    if (!ALLOWED_TTLS.includes(ttlSeconds)) {
      return NextResponse.json({ error: 'Invalid TTL' }, { status: 400 })
    }

    const ip = getClientIp(req)
    const isCli = clientType === 'cli' || clientType === 'extension'

    // Verify Turnstile (skip for CLI/extension — they use stricter IP rate limit)
    if (!isCli) {
      if (!turnstileToken) {
        return NextResponse.json({ error: 'Turnstile token required' }, { status: 400 })
      }
      const ok = await verifyTurnstile(turnstileToken, ip)
      if (!ok) {
        return NextResponse.json({ error: 'Turnstile verification failed' }, { status: 403 })
      }
    }

    const supabase = createServiceClient()

    // Per-IP rate limit check
    const rateLimit = isCli ? RATE_ROOMS_PER_HOUR_CLI : RATE_ROOMS_PER_HOUR
    const { count } = await supabase
      .from('rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('ip', ip)
      .eq('action', 'room_create')
      .gte('created_at', new Date(Date.now() - 3600_000).toISOString())

    if ((count ?? 0) >= rateLimit) {
      return NextResponse.json(
        { error: `Rate limit: max ${rateLimit} rooms/hour from this IP` },
        { status: 429 }
      )
    }

    // Create room
    const id = generateRoomId()
    const { data, error } = await supabase.rpc('create_room', {
      p_id: id,
      p_ttl_seconds: ttlSeconds,
      p_passcode: passcode || null,
      p_encrypted: encrypted
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Record rate limit event
    await supabase.from('rate_limits').insert({ ip, action: 'room_create' })

    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
