import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);
async function run() {
  const { data } = await supabase.from('jivi_diagnoses').select('*').order('created_at', { ascending: false }).limit(2);
  console.dir(data, { depth: null });
}
run();
