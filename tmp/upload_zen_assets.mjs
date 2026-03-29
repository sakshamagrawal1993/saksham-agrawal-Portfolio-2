import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://ralhkmpbslsdkwnqzqen.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gMdAKFb5sgN89c7OzhIRdA_nrNGz3pP'; // VITE_SUPABASE_ANON_KEY
const BUCKET = 'mind-coach';

const files = [
  { local: '/Users/sakshamagrawal/.gemini/antigravity/brain/b3937f70-406e-4e48-bb05-0afbe451cfb5/hero_aura_zen_1774777549788.png', remote: 'hero_aura_zen.png' },
  { local: '/Users/sakshamagrawal/.gemini/antigravity/brain/b3937f70-406e-4e48-bb05-0afbe451cfb5/phase_1_rapport_zen_1774777577976.png', remote: 'phase_1_rapport_zen.png' },
  { local: '/Users/sakshamagrawal/.gemini/antigravity/brain/b3937f70-406e-4e48-bb05-0afbe451cfb5/phase_2_exploration_zen_1774777608656.png', remote: 'phase_2_exploration_zen.png' },
  { local: '/Users/sakshamagrawal/.gemini/antigravity/brain/b3937f70-406e-4e48-bb05-0afbe451cfb5/phase_3_deep_work_zen_1774777638728.png', remote: 'phase_3_deep_work_zen.png' },
  { local: '/Users/sakshamagrawal/.gemini/antigravity/brain/b3937f70-406e-4e48-bb05-0afbe451cfb5/phase_4_integration_zen_1774777670009.png', remote: 'phase_4_integration_zen.png' },
];

async function uploadFile(filePath, remoteName) {
  const fileData = fs.readFileSync(filePath);
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${remoteName}`;
  
  console.log(`Uploading ${remoteName}...`);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
      'Content-Type': 'image/png',
      'x-upsert': 'true'
    },
    body: fileData
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to upload ${remoteName}: ${response.statusText} - ${error}`);
  }
  console.log(`Successfully uploaded ${remoteName}`);
}

async function run() {
  try {
    for (const f of files) {
      await uploadFile(f.local, f.remote);
    }
    console.log('All assets uploaded successfully.');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

run();
