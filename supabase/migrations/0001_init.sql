-- Enable pgcrypto for uuid generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Create Tables
CREATE TABLE public.rooms (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id TEXT NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    type TEXT NOT NULL,
    language TEXT,
    meta JSONB,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. Enable RLS
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated, making tables completely inaccessible directly
-- (Requires using the functions below which are SECURITY DEFINER)

-- 3. Security Definer Functions
CREATE OR REPLACE FUNCTION public.create_room(p_id TEXT, p_ttl_seconds INT)
RETURNS public.rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_room public.rooms;
BEGIN
    -- Validate ID format (basic check)
    IF length(p_id) < 16 THEN
        RAISE EXCEPTION 'Room ID must be at least 16 characters';
    END IF;
    
    -- Validate TTL allowlist
    IF p_ttl_seconds NOT IN (3600, 86400, 604800) THEN
        RAISE EXCEPTION 'Invalid TTL';
    END IF;

    INSERT INTO public.rooms (id, expires_at)
    VALUES (p_id, now() + (p_ttl_seconds || ' seconds')::INTERVAL)
    RETURNING * INTO v_room;

    RETURN v_room;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_room(p_id TEXT)
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

    RETURN v_room;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_items(p_room_id TEXT)
RETURNS SETOF public.items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Check if room exists and is not expired
    PERFORM 1 FROM public.rooms WHERE id = p_room_id AND expires_at > now();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Room expired or not found';
    END IF;

    RETURN QUERY
    SELECT * FROM public.items
    WHERE room_id = p_room_id
    ORDER BY created_at DESC
    LIMIT 500;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_item(
    p_room_id TEXT,
    p_content TEXT,
    p_type TEXT,
    p_language TEXT DEFAULT NULL,
    p_meta JSONB DEFAULT NULL
)
RETURNS public.items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item public.items;
    v_count INT;
BEGIN
    -- Check if room exists and is not expired
    PERFORM 1 FROM public.rooms WHERE id = p_room_id AND expires_at > now();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Room expired or not found';
    END IF;

    -- Validate max content size (~100KB)
    IF octet_length(p_content) > 102400 THEN
        RAISE EXCEPTION 'Content too large';
    END IF;

    -- Limit max 500 items per room
    SELECT COUNT(*) INTO v_count FROM public.items WHERE room_id = p_room_id;
    IF v_count >= 500 THEN
        RAISE EXCEPTION 'Room is full (max 500 items)';
    END IF;

    -- Rate limiting check (e.g. max 30 inserts per minute)
    SELECT COUNT(*) INTO v_count FROM public.items 
    WHERE room_id = p_room_id AND created_at > now() - INTERVAL '1 minute';
    
    IF v_count >= 30 THEN
        RAISE EXCEPTION 'Rate limit exceeded';
    END IF;

    INSERT INTO public.items (room_id, content, type, language, meta)
    VALUES (p_room_id, p_content, p_type, p_language, p_meta)
    RETURNING * INTO v_item;

    RETURN v_item;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_item(p_room_id TEXT, p_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Check room expiry
    PERFORM 1 FROM public.rooms WHERE id = p_room_id AND expires_at > now();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Room expired or not found';
    END IF;

    DELETE FROM public.items WHERE room_id = p_room_id AND id = p_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_room(p_room_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.rooms WHERE id = p_room_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_rooms()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted INT;
BEGIN
    WITH deleted AS (
        DELETE FROM public.rooms WHERE expires_at <= now() RETURNING 1
    )
    SELECT count(*) INTO v_deleted FROM deleted;
    
    RETURN v_deleted;
END;
$$;

-- 4. Set up pg_cron for automatic cleanup (hourly)
-- Requires pg_cron extension to be enabled in Supabase (Dashboard > Database > Extensions)
-- Once pg_cron is enabled, uncomment and run:
/*
SELECT cron.schedule(
    'cleanup-expired-rooms',
    '0 * * * *', -- Every hour
    $$ SELECT public.cleanup_expired_rooms(); $$
);
*/
