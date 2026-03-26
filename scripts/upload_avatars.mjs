import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Setup supabase client
const supabaseUrl = 'https://ralhkmpbslsdkwnqzqen.supabase.co';
const supabaseKey = 'sb_publishable_gMdAKFb5sgN89c7OzhIRdA_nrNGz3pP'; // anon key, should work since insert policy is public
const supabase = createClient(supabaseUrl, supabaseKey);

const avatars = [
  { id: 'maya', filePath: '/Users/sakshamagrawal/.gemini/antigravity/brain/10c6543e-652c-4926-a406-4c932d77f2a0/maya_avatar_1774249307501.png' },
  { id: 'alex', filePath: '/Users/sakshamagrawal/.gemini/antigravity/brain/10c6543e-652c-4926-a406-4c932d77f2a0/alex_avatar_1774249323851.png' },
  { id: 'sage', filePath: '/Users/sakshamagrawal/.gemini/antigravity/brain/10c6543e-652c-4926-a406-4c932d77f2a0/sage_avatar_1774249342386.png' }
];

async function uploadAvatars() {
  for (const avatar of avatars) {
    console.log(`Uploading ${avatar.id}...`);
    const fileBuffer = fs.readFileSync(avatar.filePath);
    
    // We upload with upsert: false, if it exists we skip or err
    const { data, error } = await supabase.storage
      .from('guide-avatars')
      .upload(`${avatar.id}.png`, fileBuffer, {
        contentType: 'image/png',
        upsert: true
      });

    if (error) {
      console.error(`Error uploading ${avatar.id}:`, error);
    } else {
      console.log(`Success uploading ${avatar.id}:`, data);
    }
  }
}

uploadAvatars().then(() => console.log('Done')).catch(console.error);
