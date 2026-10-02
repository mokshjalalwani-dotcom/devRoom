/**
 * src/lib/storage/index.ts
 * ─────────────────────────────────────────────────────────────────
 * Storage abstraction interface. Swap the implementation by changing
 * only this file and the implementation module. Current impl: Supabase.
 * Future swap: Cloudflare R2 – implement the same interface in
 * src/lib/storage/r2.ts and re-export it here.
 * ─────────────────────────────────────────────────────────────────
 */
export { createSupabaseStorage as createStorage } from './supabase'
export type { StorageProvider } from './types'
