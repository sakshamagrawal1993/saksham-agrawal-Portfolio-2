const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  const { data, error } = await supabase
    .from('jivi_chat_sessions')
    .update({ status: 'completed' })
    .eq('status', 'active');
  console.log("Updated active sessions to completed:", data, error);
}
run();
