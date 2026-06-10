const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'test@example.com',
      password: 'password'
  });
  const userId = authData.user.id;
  
  const { data, error } = await supabase
                .from('jivi_profiles')
                .select('id, name')
                .eq('user_id', userId)
                .single();
  console.log("Data:", data, "Error:", error);
}
run();
