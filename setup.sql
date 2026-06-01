-- DROP Web Simulation Setup Schema
-- Run this in your Supabase SQL Editor

-- 1. Create tables
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trigger_type TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT now() NOT NULL,
    image_url TEXT,
    notes TEXT,
    correlation_id UUID DEFAULT gen_random_uuid()
);

CREATE TABLE IF NOT EXISTS public.camera_commands (
    id BIGSERIAL PRIMARY KEY,
    camera_id TEXT NOT NULL,
    command TEXT DEFAULT 'capture' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    status TEXT DEFAULT 'pending' NOT NULL,
    correlation_id UUID DEFAULT gen_random_uuid(),
    trigger_type TEXT,
    notes TEXT
);

-- Enable Realtime replication
-- Safely remove from publication first (ignore if not already added)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.camera_commands;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.events;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Enable replica identity full so we get old/new values in updates
ALTER TABLE public.camera_commands REPLICA IDENTITY FULL;
ALTER TABLE public.events REPLICA IDENTITY FULL;

-- Add tables to the supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.camera_commands;
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;

-- 2. Configure Row Level Security (RLS)
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.camera_commands ENABLE ROW LEVEL SECURITY;

-- Allow public access for this demo/simulation context
CREATE POLICY "Allow public SELECT on events" ON public.events FOR SELECT USING (true);
CREATE POLICY "Allow public INSERT on events" ON public.events FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public SELECT on camera_commands" ON public.camera_commands FOR SELECT USING (true);
CREATE POLICY "Allow public INSERT on camera_commands" ON public.camera_commands FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public UPDATE on camera_commands" ON public.camera_commands FOR UPDATE USING (true);

-- 3. Storage Setup (Public bucket 'drop-captures')
INSERT INTO storage.buckets (id, name, public)
VALUES ('drop-captures', 'drop-captures', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for public anonymous access to read and upload captured photos
CREATE POLICY "Allow public select on captures"
ON storage.objects FOR SELECT
USING (bucket_id = 'drop-captures');

CREATE POLICY "Allow public insert on captures"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'drop-captures');

CREATE POLICY "Allow public update on captures"
ON storage.objects FOR UPDATE
USING (bucket_id = 'drop-captures')
WITH CHECK (bucket_id = 'drop-captures');

CREATE POLICY "Allow public delete on captures"
ON storage.objects FOR DELETE
USING (bucket_id = 'drop-captures');
