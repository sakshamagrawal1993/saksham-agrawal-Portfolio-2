import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function runTest() {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'test@example.com',
    password: 'password',
  });

  if (authError) {
    console.error('Sign in error:', authError);
    return;
  }
  
  console.log('Testing start_session...');
  const { data: sessionData, error: sessionError } = await supabase.functions.invoke('ai-care-proxy', {
    body: { action: 'start_session', user_id: authData.user?.id },
    headers: { Authorization: `Bearer ${authData.session?.access_token}` }
  });

  console.log('start_session output:', sessionData, sessionError);
  
  if (sessionData && sessionData.session_id) {
    console.log('Testing send_message...');
    const { data: msgData, error: msgError } = await supabase.functions.invoke('ai-care-proxy', {
      body: { action: 'send_message', session_id: sessionData.session_id, message: 'I have a headache' },
      headers: { Authorization: `Bearer ${authData.session?.access_token}` }
    });

    console.log('send_message output:', msgData, msgError);
  }
}

runTest();
