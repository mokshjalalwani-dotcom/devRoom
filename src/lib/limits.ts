/**
 * src/lib/limits.ts
 * ─────────────────────────────────────────────────────────────────
 * ALL tunable free-tier limits live here (mirrored in SQL migration).
 * To raise a limit: change the constant, update the SQL mirror in
 * 0002_v2.sql, and re-run the migration.
 * ─────────────────────────────────────────────────────────────────
 */

// ── Text limits ──────────────────────────────────────────────────
/** Maximum UTF-8 bytes per item content */
export const MAX_ITEM_BYTES = 51_200              // 50 KB
/** Maximum items per room */
export const MAX_ITEMS_PER_ROOM = 200
/** Maximum item tags per item */
export const MAX_TAGS_PER_ITEM = 5
/** Maximum characters per tag */
export const MAX_TAG_CHARS = 24
/** Real-time rate limit: max inserts per minute per room */
export const MAX_INSERTS_PER_MINUTE = 30

// ── Image / storage limits ───────────────────────────────────────
/** Maximum images per room */
export const MAX_IMAGES_PER_ROOM = 5
/** Maximum total storage bytes per room */
export const MAX_STORAGE_PER_ROOM_BYTES = 10 * 1024 * 1024   // 10 MB
/** Maximum single file size after client compression */
export const MAX_FILE_BYTES = 2 * 1024 * 1024                 // 2 MB
/** Maximum dimension (px) for full-size WebP after compression */
export const MAX_IMAGE_DIMENSION = 1920
/** Maximum dimension (px) for thumbnail WebP */
export const MAX_THUMB_DIMENSION = 320
/** WebP quality for full-size (0–1) */
export const IMAGE_QUALITY = 0.8
/** WebP quality for thumbnail */
export const THUMB_QUALITY = 0.75
/** Signed URL TTL for downloads (seconds) */
export const SIGNED_URL_TTL_SECONDS = 60
/** File objects expire at min(room expiry, file created_at + 24 h) */
export const FILE_MAX_LIFETIME_SECONDS = 86_400              // 24 h

// ── Global storage kill switch ───────────────────────────────────
/** Default soft cap in bytes (overridable via STORAGE_SOFT_CAP_BYTES env var) */
export const STORAGE_SOFT_CAP_BYTES_DEFAULT = 400 * 1024 * 1024  // 400 MB

// ── Rate limits (per-IP via DB table) ───────────────────────────
/** Room creations per IP per hour */
export const RATE_ROOMS_PER_HOUR = 10
/** Uploads per IP per hour */
export const RATE_UPLOADS_PER_HOUR = 20
/** Stricter room creation limit for CLI/extension clients */
export const RATE_ROOMS_PER_HOUR_CLI = 5

// ── Room limits ──────────────────────────────────────────────────
/** Allowed TTL values in seconds */
export const ALLOWED_TTLS = [3600, 86400, 604800] as const
/** Minimum room ID length */
export const MIN_ROOM_ID_LENGTH = 16
/** Read token length */
export const READ_TOKEN_LENGTH = 20

// ── Cleanup ──────────────────────────────────────────────────────
/** Batch size for cleanup_expired_rooms */
export const CLEANUP_BATCH_SIZE = 100

// ── Passcode ─────────────────────────────────────────────────────
/** Max wrong passcode attempts per room per 15 minutes */
export const MAX_PASSCODE_ATTEMPTS = 10
