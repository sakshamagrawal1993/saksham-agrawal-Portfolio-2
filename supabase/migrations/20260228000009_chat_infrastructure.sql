-- Table: health_chat_sessions
CREATE TABLE IF NOT EXISTS public.health_chat_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    twin_id UUID NOT NULL REFERENCES public.health_twins(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    active BOOLEAN NOT NULL DEFAULT true
);

-- Table: health_chat_messages
CREATE TABLE IF NOT EXISTS public.health_chat_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES public.health_chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Table: health_twin_memories
CREATE TABLE IF NOT EXISTS public.health_twin_memories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    twin_id UUID NOT NULL REFERENCES public.health_twins(id) ON DELETE CASCADE,
    memory_text TEXT NOT NULL,
    source_message_id UUID REFERENCES public.health_chat_messages(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_health_chat_sessions_twin_id ON public.health_chat_sessions(twin_id);
CREATE INDEX IF NOT EXISTS idx_health_chat_messages_session_id ON public.health_chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_health_chat_messages_timestamp ON public.health_chat_messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_health_twin_memories_twin_id ON public.health_twin_memories(twin_id);

-- RLS Policies
ALTER TABLE public.health_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_twin_memories ENABLE ROW LEVEL SECURITY;

-- Allow completely public access for this portfolio demo
CREATE POLICY "Enable read access for all users - sessions" ON public.health_chat_sessions FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users - sessions" ON public.health_chat_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users - sessions" ON public.health_chat_sessions FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users - sessions" ON public.health_chat_sessions FOR DELETE USING (true);

CREATE POLICY "Enable read access for all users - messages" ON public.health_chat_messages FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users - messages" ON public.health_chat_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users - messages" ON public.health_chat_messages FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users - messages" ON public.health_chat_messages FOR DELETE USING (true);

CREATE POLICY "Enable read access for all users - memories" ON public.health_twin_memories FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users - memories" ON public.health_twin_memories FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users - memories" ON public.health_twin_memories FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users - memories" ON public.health_twin_memories FOR DELETE USING (true);
