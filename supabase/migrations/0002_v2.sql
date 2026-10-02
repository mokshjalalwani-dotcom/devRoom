-- ================================================================
-- Migration: 0002_v2.sql
-- Version: 2.0 – Images, Abuse Protection, Richer Types, Room Controls,
--          Privacy, Read Tokens, and Free-tier Hardening
-- ================================================================
-- NEVER edit 0001_init.sql. All changes go here.
-- All limits below are mirrors of src/lib/limits.ts constants.
-- ================================================================

-- ──────────────────────────────────────────────────────────────────
-- PHASE 0: Extensions
-- ──────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ──────────────────────────────────────────────────────────────────
-- PHASE 1: Storage stats (global kill switch)
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.storage_stats (
    id          INT PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- singleton
    total_bytes BIGINT NOT NULL DEFAULT 0
);
INSERT INTO public.storage_stats (id, total_bytes) VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.storage_stats ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────
-- PHASE 1: Pending file registry (tracks uploads before item is confirmed)
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pending_files (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id     TEXT NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    path        TEXT NOT NULL,
    thumb_path  TEXT NOT NULL,
    size_bytes  INT  NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pending_files ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────
-- PHASE 2: Rate limits table
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rate_limits (
    ip          TEXT NOT NULL,
    action      TEXT NOT NULL,         -- 'room_create' | 'upload'
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (ip, created_at, action)
);
-- auto-expire with index on time (old rows cleaned up by cleanup job)
CREATE INDEX IF NOT EXISTS idx_rate_limits_time ON public.rate_limits (created_at);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────
-- PHASE 2: Item count denormalization (O(1) room fullness check)
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.room_counters (
    room_id     TEXT PRIMARY KEY REFERENCES public.rooms(id) ON DELETE CASCADE,
    item_count  INT NOT NULL DEFAULT 0
);
ALTER TABLE public.room_counters ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────
-- PHASE 3 / 4 / 5: Extend rooms table with v2 columns
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE public.rooms
    ADD COLUMN IF NOT EXISTS ttl_seconds       INT NOT NULL DEFAULT 86400,
    ADD COLUMN IF NOT EXISTS extended          BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS read_token        TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS passcode_hash     TEXT,           -- bcrypt, NULL = no passcode
    ADD COLUMN IF NOT EXISTS is_encrypted      BOOLEAN NOT NULL DEFAULT FALSE;

-- index on expiry for efficient cleanup batching
CREATE INDEX IF NOT EXISTS idx_rooms_expires_at ON public.rooms (expires_at);

-- backfill read_token for existing rooms (random 20-char token)
UPDATE public.rooms
SET read_token = substring(encode(gen_random_bytes(20), 'hex'), 1, 20)
WHERE read_token IS NULL;

-- ──────────────────────────────────────────────────────────────────
-- PHASE 3 / 4 / 5: Extend items table
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE public.items
    ADD COLUMN IF NOT EXISTS pinned            BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS tags              TEXT[]  NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS burn_after_read   BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS content_consumed  BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_items_room_created ON public.items (room_id, created_at DESC);

-- backfill room_counters for existing rooms
INSERT INTO public.room_counters (room_id, item_count)
SELECT room_id, COUNT(*) FROM public.items GROUP BY room_id
ON CONFLICT (room_id) DO UPDATE SET item_count = EXCLUDED.item_count;

-- ──────────────────────────────────────────────────────────────────
-- HELPERS: validate passcode
-- ──────────────────────────────────────────────────────────────────
-- Returns TRUE if p_hash is null (room has no passcode) OR bcrypt matches
CREATE OR REPLACE FUNCTION public._check_passcode(p_hash TEXT, p_passcode TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_hash IS NULL THEN RETURN TRUE; END IF;
    IF p_passcode IS NULL THEN RETURN FALSE; END IF;
    RETURN p_hash = crypt(p_passcode, p_hash);
END;
$$;

-- ──────────────────────────────────────────────────────────────────
-- UPDATED: create_room (v2 – adds ttl_seconds, read_token, passcode, encrypted)
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_room(
    p_id          TEXT,
    p_ttl_seconds INT,
    p_passcode    TEXT    DEFAULT NULL,
    p_encrypted   BOOLEAN DEFAULT FALSE
)
RETURNS public.rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_room       public.rooms;
    v_hash       TEXT;
    v_read_token TEXT;
BEGIN
    IF length(p_id) < 16 THEN
        RAISE EXCEPTION 'Room ID must be at least 16 characters';
    END IF;
    IF p_ttl_seconds NOT IN (3600, 86400, 604800) THEN
        RAISE EXCEPTION 'Invalid TTL';
    END IF;

    v_hash := CASE WHEN p_passcode IS NOT NULL AND p_passcode <> ''
                   THEN crypt(p_passcode, gen_salt('bf', 10))
                   ELSE NULL END;

    v_read_token := substring(encode(gen_random_bytes(20), 'hex'), 1, 20);

    INSERT INTO public.rooms (id, expires_at, ttl_seconds, read_token, passcode_hash, is_encrypted)
    VALUES (
        p_id,
        now() + (p_ttl_seconds || ' seconds')::INTERVAL,
        p_ttl_seconds,
        v_read_token,
        v_hash,
        p_encrypted
    )
    RETURNING * INTO v_room;

    -- seed counter row
    INSERT INTO public.room_counters (room_id, item_count) VALUES (p_id, 0);

    RETURN v_room;
END;
$$;

-- ──────────────────────────────────────────────────────────────────
-- UPDATED: get_room (v2 – supports optional passcode)
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_room(
    p_id       TEXT,
    p_passcode TEXT DEFAULT NULL
)
RETURNS public.rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_room public.rooms;
BEGIN
    SELECT * INTO v_room FROM public.rooms WHERE id = p_id AND expires_at > now();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Room expired or not found';
    END IF;
    IF NOT public._check_passcode(v_room.passcode_hash, p_passcode) THEN
        RAISE EXCEPTION 'Wrong passcode';
    END IF;
    RETURN v_room;
END;
$$;

-- ──────────────────────────────────────────────────────────────────
-- NEW: get_room_by_read_token (read-only, passcode not required)
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_room_by_read_token(p_token TEXT)
RETURNS TABLE (id TEXT, expires_at TIMESTAMPTZ, ttl_seconds INT, is_encrypted BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT r.id, r.expires_at, r.ttl_seconds, r.is_encrypted
    FROM public.rooms r
    WHERE r.read_token = p_token AND r.expires_at > now();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Room not found or expired';
    END IF;
END;
$$;

-- ──────────────────────────────────────────────────────────────────
-- UPDATED: add_item (v2 – reduced limits, counter, tags, burn, encrypted)
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_item(
    p_room_id         TEXT,
    p_content         TEXT,
    p_type            TEXT,
    p_language        TEXT    DEFAULT NULL,
    p_meta            JSONB   DEFAULT NULL,
    p_passcode        TEXT    DEFAULT NULL,
    p_burn_after_read BOOLEAN DEFAULT FALSE,
    p_tags            TEXT[]  DEFAULT '{}'
)
RETURNS public.items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item    public.items;
    v_room    public.rooms;
    v_count   INT;
BEGIN
    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id AND expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'Room expired or not found'; END IF;

    IF NOT public._check_passcode(v_room.passcode_hash, p_passcode) THEN
        RAISE EXCEPTION 'Wrong passcode';
    END IF;

    -- 50 KB limit (mirrors MAX_ITEM_BYTES)
    IF octet_length(p_content) > 51200 THEN
        RAISE EXCEPTION 'Content too large (max 50 KB)';
    END IF;

    -- 200 items per room (mirrors MAX_ITEMS_PER_ROOM); use counter for O(1) check
    SELECT item_count INTO v_count FROM public.room_counters WHERE room_id = p_room_id;
    IF COALESCE(v_count, 0) >= 200 THEN
        RAISE EXCEPTION 'Room is full (max 200 items)';
    END IF;

    -- Rate limit: 30 inserts per minute per room
    SELECT COUNT(*) INTO v_count FROM public.items
    WHERE room_id = p_room_id AND created_at > now() - INTERVAL '1 minute';
    IF v_count >= 30 THEN RAISE EXCEPTION 'Rate limit exceeded'; END IF;

    -- Validate tags (max 5, max 24 chars each)
    IF array_length(p_tags, 1) > 5 THEN
        RAISE EXCEPTION 'Max 5 tags per item';
    END IF;

    INSERT INTO public.items (room_id, content, type, language, meta, burn_after_read, tags)
    VALUES (p_room_id, p_content, p_type, p_language, p_meta, p_burn_after_read, p_tags)
    RETURNING * INTO v_item;

    -- Increment counter
    INSERT INTO public.room_counters (room_id, item_count) VALUES (p_room_id, 1)
    ON CONFLICT (room_id) DO UPDATE SET item_count = room_counters.item_count + 1;

    RETURN v_item;
END;
$$;

-- ──────────────────────────────────────────────────────────────────
-- UPDATED: list_items (v2 – respects burn_after_read, pinned first)
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_items(
    p_room_id  TEXT,
    p_passcode TEXT DEFAULT NULL
)
RETURNS TABLE (
    id              UUID,
    room_id         TEXT,
    content         TEXT,
    type            TEXT,
    language        TEXT,
    meta            JSONB,
    created_at      TIMESTAMPTZ,
    pinned          BOOLEAN,
    tags            TEXT[],
    burn_after_read BOOLEAN,
    content_hidden  BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_room public.rooms;
BEGIN
    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id AND expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'Room expired or not found'; END IF;
    IF NOT public._check_passcode(v_room.passcode_hash, p_passcode) THEN
        RAISE EXCEPTION 'Wrong passcode';
    END IF;

    RETURN QUERY
    SELECT
        i.id,
        i.room_id,
        -- hide burn-after-read content until consumed
        CASE WHEN i.burn_after_read AND NOT i.content_consumed THEN NULL
             ELSE i.content END AS content,
        i.type,
        i.language,
        i.meta,
        i.created_at,
        i.pinned,
        i.tags,
        i.burn_after_read,
        (i.burn_after_read AND NOT i.content_consumed) AS content_hidden
    FROM public.items i
    WHERE i.room_id = p_room_id
    ORDER BY i.pinned DESC, i.created_at DESC
    LIMIT 500;
END;
$$;

-- ──────────────────────────────────────────────────────────────────
-- NEW: list_items_by_read_token (read-only view)
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_items_by_read_token(p_token TEXT)
RETURNS TABLE (
    id              UUID,
    room_id         TEXT,
    content         TEXT,
    type            TEXT,
    language        TEXT,
    meta            JSONB,
    created_at      TIMESTAMPTZ,
    pinned          BOOLEAN,
    tags            TEXT[],
    burn_after_read BOOLEAN,
    content_hidden  BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_room_id TEXT;
BEGIN
    SELECT id INTO v_room_id FROM public.rooms
    WHERE read_token = p_token AND expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'Room not found or expired'; END IF;

    RETURN QUERY
    SELECT
        i.id, i.room_id,
        CASE WHEN i.burn_after_read AND NOT i.content_consumed THEN NULL
             ELSE i.content END,
        i.type, i.language, i.meta, i.created_at, i.pinned, i.tags,
        i.burn_after_read,
        (i.burn_after_read AND NOT i.content_consumed) AS content_hidden
    FROM public.items i
    WHERE i.room_id = v_room_id
    ORDER BY i.pinned DESC, i.created_at DESC
    LIMIT 500;
END;
$$;

-- ──────────────────────────────────────────────────────────────────
-- UPDATED: delete_item (v2 – with passcode, counter decrement)
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_item(
    p_room_id  TEXT,
    p_item_id  UUID,
    p_passcode TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_room public.rooms;
BEGIN
    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id AND expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'Room expired or not found'; END IF;
    IF NOT public._check_passcode(v_room.passcode_hash, p_passcode) THEN
        RAISE EXCEPTION 'Wrong passcode';
    END IF;
    DELETE FROM public.items WHERE room_id = p_room_id AND id = p_item_id;
    -- decrement counter (floor at 0)
    UPDATE public.room_counters
    SET item_count = GREATEST(item_count - 1, 0)
    WHERE room_id = p_room_id;
END;
$$;

-- ──────────────────────────────────────────────────────────────────
-- UPDATED: delete_room (v2 – with passcode)
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_room(
    p_room_id  TEXT,
    p_passcode TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_room public.rooms;
BEGIN
    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
    IF NOT FOUND THEN RETURN; END IF; -- idempotent
    IF NOT public._check_passcode(v_room.passcode_hash, p_passcode) THEN
        RAISE EXCEPTION 'Wrong passcode';
    END IF;
    DELETE FROM public.rooms WHERE id = p_room_id;
END;
$$;

-- ──────────────────────────────────────────────────────────────────
-- NEW: extend_room (adds original TTL once; rooms.extended guard)
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.extend_room(
    p_room_id  TEXT,
    p_passcode TEXT DEFAULT NULL
)
RETURNS public.rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_room public.rooms;
BEGIN
    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id AND expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'Room expired or not found'; END IF;
    IF NOT public._check_passcode(v_room.passcode_hash, p_passcode) THEN
        RAISE EXCEPTION 'Wrong passcode';
    END IF;
    IF v_room.extended THEN RAISE EXCEPTION 'Room already extended once'; END IF;

    UPDATE public.rooms
    SET expires_at = expires_at + (ttl_seconds || ' seconds')::INTERVAL,
        extended   = TRUE
    WHERE id = p_room_id
    RETURNING * INTO v_room;

    RETURN v_room;
END;
$$;

-- ──────────────────────────────────────────────────────────────────
-- NEW: pin_item
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pin_item(
    p_room_id  TEXT,
    p_item_id  UUID,
    p_pinned   BOOLEAN DEFAULT TRUE,
    p_passcode TEXT    DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_room public.rooms;
BEGIN
    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id AND expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'Room expired or not found'; END IF;
    IF NOT public._check_passcode(v_room.passcode_hash, p_passcode) THEN
        RAISE EXCEPTION 'Wrong passcode';
    END IF;
    UPDATE public.items SET pinned = p_pinned
    WHERE id = p_item_id AND room_id = p_room_id;
END;
$$;

-- ──────────────────────────────────────────────────────────────────
-- NEW: update_item_tags
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_item_tags(
    p_room_id  TEXT,
    p_item_id  UUID,
    p_tags     TEXT[],
    p_passcode TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_room public.rooms;
BEGIN
    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id AND expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'Room expired or not found'; END IF;
    IF NOT public._check_passcode(v_room.passcode_hash, p_passcode) THEN
        RAISE EXCEPTION 'Wrong passcode';
    END IF;
    IF array_length(p_tags, 1) > 5 THEN RAISE EXCEPTION 'Max 5 tags'; END IF;
    UPDATE public.items SET tags = p_tags
    WHERE id = p_item_id AND room_id = p_room_id;
END;
$$;

-- ──────────────────────────────────────────────────────────────────
-- NEW: consume_item (burn after read – returns content, deletes row)
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.consume_item(
    p_room_id  TEXT,
    p_item_id  UUID,
    p_passcode TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_room    public.rooms;
    v_content TEXT;
BEGIN
    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id AND expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'Room expired or not found'; END IF;
    IF NOT public._check_passcode(v_room.passcode_hash, p_passcode) THEN
        RAISE EXCEPTION 'Wrong passcode';
    END IF;

    SELECT content INTO v_content FROM public.items
    WHERE id = p_item_id AND room_id = p_room_id AND burn_after_read = TRUE AND content_consumed = FALSE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item not found or already consumed'; END IF;

    DELETE FROM public.items WHERE id = p_item_id AND room_id = p_room_id;

    UPDATE public.room_counters SET item_count = GREATEST(item_count - 1, 0)
    WHERE room_id = p_room_id;

    RETURN v_content;
END;
$$;

-- ──────────────────────────────────────────────────────────────────
-- NEW: register_file_upload (service-role only via API route)
-- Validates limits, registers pending file, updates global storage_stats
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.register_file_upload(
    p_room_id       TEXT,
    p_pending_id    UUID,
    p_path          TEXT,
    p_thumb_path    TEXT,
    p_size_bytes    INT,
    p_soft_cap      BIGINT DEFAULT 419430400  -- 400 MB default
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_image_count INT;
    v_room_bytes  BIGINT;
    v_global_bytes BIGINT;
BEGIN
    -- Room must exist and not be expired
    PERFORM 1 FROM public.rooms WHERE id = p_room_id AND expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'Room expired or not found'; END IF;

    -- Per-room image count (max 5)
    SELECT COUNT(*) INTO v_image_count FROM public.pending_files WHERE room_id = p_room_id;
    IF v_image_count >= 5 THEN RAISE EXCEPTION 'Room image limit reached (max 5)'; END IF;

    -- Per-room bytes (max 10 MB)
    SELECT COALESCE(SUM(size_bytes), 0) INTO v_room_bytes FROM public.pending_files WHERE room_id = p_room_id;
    IF v_room_bytes + p_size_bytes > 10485760 THEN
        RAISE EXCEPTION 'Room storage limit reached (max 10 MB)';
    END IF;

    -- Global kill switch
    SELECT total_bytes INTO v_global_bytes FROM public.storage_stats WHERE id = 1;
    IF v_global_bytes + p_size_bytes > p_soft_cap THEN
        RAISE EXCEPTION 'Uploads are full right now';
    END IF;

    -- File size hard cap (2 MB)
    IF p_size_bytes > 2097152 THEN RAISE EXCEPTION 'File too large (max 2 MB)'; END IF;

    INSERT INTO public.pending_files (id, room_id, path, thumb_path, size_bytes)
    VALUES (p_pending_id, p_room_id, p_path, p_thumb_path, p_size_bytes);

    UPDATE public.storage_stats SET total_bytes = total_bytes + p_size_bytes WHERE id = 1;
END;
$$;

-- ──────────────────────────────────────────────────────────────────
-- NEW: confirm_file_upload (called after upload succeeds → add_item)
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_file_upload(
    p_room_id    TEXT,
    p_pending_id UUID,
    p_width      INT,
    p_height     INT
)
RETURNS public.items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pf   public.pending_files;
    v_item public.items;
BEGIN
    SELECT * INTO v_pf FROM public.pending_files WHERE id = p_pending_id AND room_id = p_room_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pending file not found'; END IF;

    INSERT INTO public.items (room_id, content, type, meta)
    VALUES (
        p_room_id,
        v_pf.path,  -- content = storage path
        'image',
        jsonb_build_object(
            'path',       v_pf.path,
            'thumbPath',  v_pf.thumb_path,
            'size',       v_pf.size_bytes,
            'width',      p_width,
            'height',     p_height
        )
    )
    RETURNING * INTO v_item;

    -- Increment counter
    INSERT INTO public.room_counters (room_id, item_count) VALUES (p_room_id, 1)
    ON CONFLICT (room_id) DO UPDATE SET item_count = room_counters.item_count + 1;

    -- Remove from pending (keep bytes in storage_stats until delete/cleanup)
    DELETE FROM public.pending_files WHERE id = p_pending_id;

    RETURN v_item;
END;
$$;

-- ──────────────────────────────────────────────────────────────────
-- NEW: decrement_storage_bytes (called when deleting an image item)
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.decrement_storage_bytes(p_bytes INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.storage_stats
    SET total_bytes = GREATEST(total_bytes - p_bytes, 0)
    WHERE id = 1;
END;
$$;

-- ──────────────────────────────────────────────────────────────────
-- UPDATED: cleanup_expired_rooms (v2 – batched, returns more info)
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_expired_rooms()
RETURNS TABLE (deleted_rooms INT, deleted_items INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rooms INT;
    v_items INT;
BEGIN
    -- Batch delete (100 at a time to stay under 10s)
    WITH expired AS (
        SELECT id FROM public.rooms
        WHERE expires_at <= now()
        LIMIT 100
    ),
    del_items AS (
        DELETE FROM public.items WHERE room_id IN (SELECT id FROM expired) RETURNING 1
    ),
    del_rooms AS (
        DELETE FROM public.rooms WHERE id IN (SELECT id FROM expired) RETURNING 1
    )
    SELECT
        (SELECT count(*) FROM del_rooms),
        (SELECT count(*) FROM del_items)
    INTO v_rooms, v_items;

    -- Prune old rate_limit rows (older than 2 hours)
    DELETE FROM public.rate_limits WHERE created_at < now() - INTERVAL '2 hours';

    -- Prune orphan pending_files (older than 30 minutes = failed uploads)
    DELETE FROM public.pending_files WHERE created_at < now() - INTERVAL '30 minutes';

    RETURN QUERY SELECT v_rooms, v_items;
END;
$$;

-- ──────────────────────────────────────────────────────────────────
-- Revoke anon execute on create_room (Turnstile enforced via API route)
-- ──────────────────────────────────────────────────────────────────
-- REVOKE EXECUTE ON FUNCTION public.create_room FROM anon;
-- NOTE: Uncomment the line above after verifying the /api/rooms route works.
-- The API route uses the service-role key to call create_room.
