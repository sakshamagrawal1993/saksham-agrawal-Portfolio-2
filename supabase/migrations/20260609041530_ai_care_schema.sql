-- Dr. Jivi AI Care Schema Migration

-- 1. jivi_profiles
CREATE TABLE IF NOT EXISTS public.jivi_profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    gender TEXT NOT NULL,
    age INTEGER NOT NULL,
    comorbidities TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for jivi_profiles
ALTER TABLE public.jivi_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.jivi_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.jivi_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.jivi_profiles FOR UPDATE USING (auth.uid() = user_id);

-- 2. jivi_chat_sessions
CREATE TABLE IF NOT EXISTS public.jivi_chat_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'emergency_stopped')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for jivi_chat_sessions
ALTER TABLE public.jivi_chat_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own sessions" ON public.jivi_chat_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sessions" ON public.jivi_chat_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions" ON public.jivi_chat_sessions FOR UPDATE USING (auth.uid() = user_id);

-- 3. jivi_chat_messages
CREATE TABLE IF NOT EXISTS public.jivi_chat_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES public.jivi_chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    options JSONB, -- For assistant role, can hold the array of options
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for jivi_chat_messages
ALTER TABLE public.jivi_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own messages via session" ON public.jivi_chat_messages FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.jivi_chat_sessions WHERE id = jivi_chat_messages.session_id AND user_id = auth.uid())
);
CREATE POLICY "Users can insert own messages" ON public.jivi_chat_messages FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.jivi_chat_sessions WHERE id = jivi_chat_messages.session_id AND user_id = auth.uid())
);

-- 4. jivi_alerts
CREATE TABLE IF NOT EXISTS public.jivi_alerts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES public.jivi_chat_sessions(id) ON DELETE CASCADE,
    is_emergency BOOLEAN DEFAULT false,
    message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for jivi_alerts
ALTER TABLE public.jivi_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own alerts" ON public.jivi_alerts FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.jivi_chat_sessions WHERE id = jivi_alerts.session_id AND user_id = auth.uid())
);
CREATE POLICY "Users can insert own alerts" ON public.jivi_alerts FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.jivi_chat_sessions WHERE id = jivi_alerts.session_id AND user_id = auth.uid())
);

-- 5. jivi_diagnoses
CREATE TABLE IF NOT EXISTS public.jivi_diagnoses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES public.jivi_chat_sessions(id) ON DELETE CASCADE,
    diagnosis_data JSONB NOT NULL,
    confidence_score FLOAT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for jivi_diagnoses
ALTER TABLE public.jivi_diagnoses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own diagnoses" ON public.jivi_diagnoses FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.jivi_chat_sessions WHERE id = jivi_diagnoses.session_id AND user_id = auth.uid())
);
CREATE POLICY "Users can insert own diagnoses" ON public.jivi_diagnoses FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.jivi_chat_sessions WHERE id = jivi_diagnoses.session_id AND user_id = auth.uid())
);
