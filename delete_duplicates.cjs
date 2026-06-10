const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: authData } = await supabase.auth.signInWithPassword({
      email: 'test@example.com',
      password: 'password'
  });
  const userId = authData.user.id;
  
  const { data: profiles } = await supabase.from('jivi_profiles').select('*').eq('user_id', userId);
  
  if (profiles && profiles.length > 1) {
    const toDelete = profiles.slice(1).map(p => p.id);
    console.log("Deleting duplicate profiles:", toDelete);
    await supabase.from('jivi_profiles').delete().in('id', toDelete);
    console.log("Duplicates deleted.");
  }
}
run();
