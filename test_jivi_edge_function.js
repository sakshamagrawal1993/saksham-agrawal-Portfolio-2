import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase variables');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function runTest() {
  console.log('--- Testing Dr. Jivi AI Care Setup ---');

  // 1. Sign up a temporary test user
  const email = `testuser${Math.floor(Math.random() * 10000)}@gmail.com`;
  const password = 'testpassword123';
  
  console.log(`\nCreating test user: ${email}`);
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError) {
    console.error('Sign up error:', authError);
    return;
  }
  console.log('User created:', authData.user?.id);

  // 2. Test start_session via Edge Function
  console.log(`\nTesting edge function: start_session`);
  const { data: sessionData, error: sessionError } = await supabase.functions.invoke('ai-care-proxy', {
    body: { action: 'start_session', user_id: authData.user?.id },
    headers: { Authorization: `Bearer ${authData.session?.access_token}` }
  });

  if (sessionError) {
    console.error('start_session error:', sessionError);
  } else {
    console.log('start_session success:', sessionData);
    
    // 3. Test send_message via Edge Function (Standard interaction)
    console.log(`\nTesting edge function: send_message (Normal)`);
    const { data: msgData, error: msgError } = await supabase.functions.invoke('ai-care-proxy', {
      body: { action: 'send_message', session_id: sessionData.session_id, message: 'I have a headache' },
      headers: { Authorization: `Bearer ${authData.session?.access_token}` }
    });

    if (msgError) {
      console.error('send_message error:', msgError);
    } else {
      console.log('send_message success:', msgData);
    }

    // 4. Test send_message via Edge Function (Emergency interaction)
    // Here we'd simulate a message that triggers the guardrail, e.g. "severe chest pain"
    console.log(`\nTesting edge function: send_message (Emergency)`);
    const { data: emgData, error: emgError } = await supabase.functions.invoke('ai-care-proxy', {
      body: { action: 'send_message', session_id: sessionData.session_id, message: 'I have severe chest pain and cannot breathe' },
      headers: { Authorization: `Bearer ${authData.session?.access_token}` }
    });

    if (emgError) {
      console.error('send_message emergency error:', emgError);
    } else {
      console.log('send_message emergency response:', emgData);
    }
  }

  console.log('\n--- Test Completed ---');
}

runTest();
