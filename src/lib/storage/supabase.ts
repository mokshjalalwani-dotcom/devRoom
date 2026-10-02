/**
 * src/lib/storage/supabase.ts
 * Supabase Storage implementation of StorageProvider.
 * To switch to Cloudflare R2, implement the same StorageProvider interface
 * in r2.ts and update src/lib/storage/index.ts to re-export it instead.
 */
import { SupabaseClient } from '@supabase/supabase-js'
import type { StorageProvider } from './types'

export function createSupabaseStorage(client: SupabaseClient): StorageProvider {
  return {
    async createUploadUrl(bucket, path, ttlSecs) {
      const { data, error } = await client.storage
        .from(bucket)
        .createSignedUploadUrl(path, { upsert: false })

      if (error || !data) throw new Error(error?.message || 'Could not create upload URL')

      return {
        signedUrl: data.signedUrl,
        path: data.path,
        token: data.token
      }
    },

    async createDownloadUrl(bucket, path, ttlSecs = 60) {
      const { data, error } = await client.storage
        .from(bucket)
        .createSignedUrl(path, ttlSecs)

      if (error || !data) throw new Error(error?.message || 'Could not create download URL')
      return data.signedUrl
    },

    async deleteObjects(bucket, paths) {
      if (paths.length === 0) return
      const { error } = await client.storage.from(bucket).remove(paths)
      if (error) throw new Error(error.message)
    },

    async listObjects(bucket, prefix) {
      const { data, error } = await client.storage.from(bucket).list(prefix, {
        limit: 100,
        offset: 0
      })
      if (error) throw new Error(error.message)
      return (data || []).map(f => `${prefix}/${f.name}`)
    }
  }
}
