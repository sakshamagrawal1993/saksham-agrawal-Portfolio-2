import { createClient } from '@supabase/supabase-js';

const s = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

async function main() {
  const { data, error } = await s
    .from('posts')
    .select('id,title,slug,is_published,author_id')
    .order('created_at', { ascending: true });
  if (error) { console.error(error); return; }
  console.log(JSON.stringify(data, null, 2));
}

main();
