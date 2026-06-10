const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'test@example.com',
      password: 'password'
  });
  
  const userId = authData.user.id;
  const { data, error } = await supabase.from('jivi_profiles').insert({
      user_id: userId,
      name: 'Test User',
      age: 30,
      gender: 'male'
  }).select();
  if (error) console.error("Insert error:", error);
  else console.log("Profile seeded.", data);
}
run();
