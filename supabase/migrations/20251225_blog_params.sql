
-- Enable RLS on tables we're about to create
alter table if exists public.posts enable row level security;
alter table if exists public.comments enable row level security;

-- Posts Table
CREATE TABLE IF NOT EXISTS public.posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    content JSONB,
    excerpt TEXT,
    cover_image_url TEXT,
    author_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    is_published BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS posts_slug_idx ON public.posts(slug);

-- Comments Table
CREATE TABLE IF NOT EXISTS public.comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Policies for Posts
CREATE POLICY "Public can view published posts" ON public.posts
    FOR SELECT
    USING (is_published = true);

CREATE POLICY "Authors can do everything on their posts" ON public.posts
    FOR ALL
    USING (auth.uid() = author_id);

-- Policies for Comments
CREATE POLICY "Public can view comments" ON public.comments
    FOR SELECT
    USING (true);

CREATE POLICY "Authenticated users can comment" ON public.comments
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can edit/delete their own comments" ON public.comments
    FOR ALL
    USING (auth.uid() = user_id);

-- Storage Bucket for Blog Media
INSERT INTO storage.buckets (id, name, public) 
VALUES ('blog-media', 'blog-media', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies
CREATE POLICY "Public Access" ON storage.objects
    FOR SELECT
    USING (bucket_id = 'blog-media');

CREATE POLICY "Authenticated Upload" ON storage.objects
    FOR INSERT
    WITH CHECK (bucket_id = 'blog-media' AND auth.role() = 'authenticated');

CREATE POLICY "Owner Delete" ON storage.objects
    FOR DELETE
    USING (bucket_id = 'blog-media' AND auth.uid() = owner);
