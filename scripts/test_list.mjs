import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ralhkmpbslsdkwnqzqen.supabase.co';
const supabaseKey = 'sb_publishable_gMdAKFb5sgN89c7OzhIRdA_nrNGz3pP';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: a1 } = await supabase.storage.from('guide-avatars').list();
  console.log('guide-avatars:', a1);
  const { data: a2 } = await supabase.storage.from('journal-media').list();
  console.log('journal-media:', a2);
}
check();
