import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ralhkmpbslsdkwnqzqen.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gMdAKFb5sgN89c7OzhIRdA_nrNGz3pP'; // VITE_SUPABASE_ANON_KEY
const BUCKET = 'mind-coach';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function listFiles() {
  console.log(`Listing files in bucket: ${BUCKET}...`);
  const { data, error } = await supabase.storage.from(BUCKET).list();

  if (error) {
    console.error(`Error listing files:`, error.message);
    process.exit(1);
  }

  if (data) {
    console.log('Files found:');
    data.forEach(file => {
      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(file.name);
      console.log(`- ${file.name}: ${publicUrl}`);
    });
  } else {
    console.log('No files found in bucket.');
  }
}

listFiles();
