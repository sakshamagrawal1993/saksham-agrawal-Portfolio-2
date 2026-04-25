import { createClient } from '@supabase/supabase-js';

const s = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

async function main() {
  const { data, error } = await s
    .from('posts')
    .select('id,title,slug,is_published,content,excerpt')
    .order('created_at', { ascending: true });
  if (error) { console.error(error); return; }
  
  data.forEach(post => {
    console.log(`Title: ${post.title}`);
    console.log(`Published: ${post.is_published}`);
    console.log(`Excerpt length: ${post.excerpt?.length || 0}`);
    console.log(`Content length: ${post.content ? (typeof post.content === 'string' ? post.content.length : JSON.stringify(post.content).length) : 0}`);
    console.log('---');
  });
}

main();
