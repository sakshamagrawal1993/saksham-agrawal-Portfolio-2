import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envConfig = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
    const [key, ...value] = line.split('=');
    if (key && value) acc[key.trim()] = value.join('=').trim().replace(/['"]/g, '');
    return acc;
}, {});

const supabaseUrl = envConfig.VITE_SUPABASE_URL;
const supabaseKey = envConfig.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase
        .from('jivi_diagnoses')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3);

    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Latest diagnosis count:", data.length);
        if (data.length > 0) {
            console.log(JSON.stringify(data[0].diagnosis_data, null, 2));
        }
    }
}

check();
