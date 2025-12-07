
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_INSIGHTSLM_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_INSIGHTSLM_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing InsightsLM Supabase environment variables');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');
