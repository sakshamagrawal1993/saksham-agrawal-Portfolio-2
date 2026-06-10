import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data } = await supabase.from('jivi_chat_sessions').select('id, created_at').order('created_at', { ascending: false }).limit(1);
  console.log(data);
}
run();
