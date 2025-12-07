
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_INSIGHTSLM_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_INSIGHTSLM_SUPABASE_ANON_KEY;

// Fallback for missing env vars to prevent build/runtime crash
const isSupabaseConfigured = supabaseUrl && supabaseAnonKey;

if (!isSupabaseConfigured) {
    console.error('Missing InsightsLM Supabase environment variables. InsightsLM features will not work.');
}

// Create client or fallback
export const supabase = isSupabaseConfigured
    ? createClient(supabaseUrl, supabaseAnonKey)
    : createClient('https://placeholder.supabase.co', 'placeholder') as any; // Prevent crash, calls will fail gracefully-ish
