const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data } = await supabase.from('jivi_diagnoses').select('*').order('created_at', { ascending: false }).limit(2);
  console.log(JSON.stringify(data, null, 2));
}
run();
