/**
 * GET /api/cleanup
 * Idempotent cleanup job. Called by GitHub Actions every 6 hours.
 * Also makes a trivial DB query so Supabase free tier never auto-pauses.
 *
 * Why GitHub Actions instead of Vercel Cron?
 * Vercel Hobby cron fires at most once/day. GitHub Actions (free tier)
 * allows scheduled workflows every 6 hours with workflow_dispatch.
 * The CRON_SECRET is a GitHub repo secret injected at runtime.
 *
 * Idempotent: safe to call multiple times. Finishes under 10 seconds.
 */
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { createStorage } from '@/lib/storage'

const BUCKET = 'room-files'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const supabase = createServiceClient()
  const storage = createStorage(supabase)

  const results: Record<string, any> = {}

  try {
    // 1. Keep-alive query (prevents Supabase free project auto-pause)
    await supabase.from('rooms').select('id').limit(1)

    // 2. Delete expired room storage objects BEFORE deleting rows
    //    (cascade deletes items, but storage objects need explicit removal)
    const { data: expiredRooms } = await supabase
      .from('rooms')
      .select('id')
      .lt('expires_at', new Date().toISOString())
      .limit(100)

    let deletedStorageObjects = 0
    if (expiredRooms && expiredRooms.length > 0) {
      for (const room of expiredRooms) {
        try {
          const objects = await storage.listObjects(BUCKET, room.id)
          if (objects.length > 0) {
            await storage.deleteObjects(BUCKET, objects)
            deletedStorageObjects += objects.length
          }
        } catch {
          // Non-fatal: bucket may not have folder for this room
        }
      }
    }
    results.deletedStorageObjects = deletedStorageObjects

    // 3. Call DB cleanup (batch of 100, prunes rate_limits and pending_files too)
    const { data: cleanupResult, error: cleanupError } = await supabase.rpc('cleanup_expired_rooms')
    if (cleanupError) {
      results.cleanupError = cleanupError.message
    } else {
      results.cleanup = cleanupResult
    }

    // 4. RECONCILER: list all bucket folders, delete any whose room no longer exists
    //    This catches orphaned storage objects from failed room deletes.
    try {
      const { data: allObjects } = await supabase.storage.from(BUCKET).list('', { limit: 100 })
      if (allObjects) {
        const roomFolders = allObjects.map(o => o.name)
        let reconciled = 0
        for (const folder of roomFolders) {
          const { data: roomExists } = await supabase
            .from('rooms')
            .select('id')
            .eq('id', folder)
            .maybeSingle()

          if (!roomExists) {
            const objects = await storage.listObjects(BUCKET, folder)
            if (objects.length > 0) {
              await storage.deleteObjects(BUCKET, objects)
              reconciled += objects.length
            }
          }
        }
        results.reconciledOrphans = reconciled
      }
    } catch (e: any) {
      results.reconcilerError = e.message
    }

    return NextResponse.json({ ok: true, ...results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
