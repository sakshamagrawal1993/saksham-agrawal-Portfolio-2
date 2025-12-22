-- Journal Feature Migration

-- 1. JOURNAL ARTICLES
create table if not exists public.journal_articles (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  date text not null, -- Keeping as text for now to match UI, but ideally should be date/tz
  excerpt text,
  image text,
  content text, -- Storing as HTML/Markdown
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS for articles
alter table public.journal_articles enable row level security;

-- Everyone can read articles
create policy "Articles are public" on public.journal_articles for select using (true);

-- Only authenticated users (or specific admins) can insert/update/delete
-- For now allowing any auth user to insert for simplicity of seeding/admin interface if built later
-- Ideally restricted to a specific role or user ID from env
create policy "Auth users can manage articles" on public.journal_articles 
  for all using (auth.role() = 'authenticated') 
  with check (auth.role() = 'authenticated');


-- 2. JOURNAL COMMENTS
create table if not exists public.journal_comments (
  id uuid default gen_random_uuid() primary key,
  article_id uuid references public.journal_articles(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS for comments
alter table public.journal_comments enable row level security;

-- Everyone can read comments
create policy "Comments are public" on public.journal_comments for select using (true);

-- Authenticated users can create comments
create policy "Auth users can create comments" on public.journal_comments 
  for insert with check (auth.uid() = user_id);

-- Users can update/delete their own comments
create policy "Users can update own comments" on public.journal_comments 
  for update using (auth.uid() = user_id);

create policy "Users can delete own comments" on public.journal_comments 
  for delete using (auth.uid() = user_id);


-- 3. SEED INITIAL DATA (Optional, based on constants.ts)
-- We leverage the fact that we can run SQL to insert existing hardcoded data
insert into public.journal_articles (title, date, excerpt, image, content) values
(
  'Agentic AI in Healthcare',
  'December 2024',
  'How Jivi AI is moving from chatbots to connected care.',
  'https://images.unsplash.com/photo-1531746790731-6c087fecd65a?auto=format&fit=crop&q=80&w=1000',
  '<p class="mb-6 text-[#5D5A53]">At Jivi, we are not just building another chatbot. We are building "Health Twin", a platform that understands a user''s complete biomarker profile.</p><p class="mb-8 text-[#5D5A53]">By utilizing Agentic RAG and Knowledge Graphs, we can provide differential diagnosis with high accuracy (94%+ in USMLE for Dr. Jivi), bridging the gap between fragmented data and actionable medical advice.</p>'
),
(
  'Navigating Digital Lending Guidelines',
  'October 2023',
  'Compliance as a product feature at BharatPe.',
  'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&q=80&w=1000',
  '<p class="mb-6 text-[#5D5A53]">When RBI released new Digital Lending Guidelines, many saw it as a hurdle. At BharatPe, I led the product roadmap to turn compliance into a trust-building feature.</p><p class="mb-6 text-[#5D5A53]">We redesigned the Credit Line/CCMS platform integration with NBFC partners, ensuring transparency while maintaining a seamless user experience for our 1.2 million Postpe card users.</p>'
),
(
  'The Strategy of Device Financing',
  'May 2022',
  'Unlocking growth for the underbanked at Xiaomi.',
  'https://images.unsplash.com/photo-1556742049-0cfed4f7a07d?auto=format&fit=crop&q=80&w=1000',
  '<p class="mb-6 text-[#5D5A53]">Launching Mi Credit Lite required onboarding 800+ offline retail partners. The challenge wasn''t just credit risk; it was operational scalability.</p><p class="mb-8 text-[#5D5A53]">By synchronizing the Xiaomi band with XFS for wearable payments and offering NFC-based solutions, we created an ecosystem that incentivized both merchants and consumers.</p>'
);
