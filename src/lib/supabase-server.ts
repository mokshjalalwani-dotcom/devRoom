/**
 * src/lib/supabase-server.ts
 * ─────────────────────────────────────────────────────────────────
 * Server-only Supabase client using the SERVICE ROLE key.
 * This key MUST NEVER be exposed to the browser.
 * Only import this file from:
 *   - src/app/api/**\/route.ts
 *   - Server Components (no 'use client' directive)
 * ─────────────────────────────────────────────────────────────────
 */
import { createClient } from '@supabase/supabase-js'

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL')
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false }
  })
}
