import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);
async function run() {
  const { data, error } = await supabase.rpc('query', { query: 'ALTER TABLE public.jivi_chat_sessions ADD COLUMN IF NOT EXISTS intermediate_diagnoses JSONB DEFAULT \'[]\'::jsonb;' });
  console.log(error);
}
run();
