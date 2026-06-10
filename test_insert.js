import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);
async function run() {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'test@example.com',
    password: 'password'
  });
  if (authError) { console.error('Auth error', authError); return; }

  // Get active session
  const { data: session } = await supabase.from('jivi_chat_sessions').select('id').eq('user_id', authData.user.id).order('created_at', { ascending: false }).limit(1).single();

  const { data, error } = await supabase.from('jivi_diagnoses').insert({
    session_id: session.id,
    diagnosis_data: [{ name: 'Migraine', confidence: 95 }],
    confidence_score: 95
  });
  console.log('Insert Error:', error);
}
run();
