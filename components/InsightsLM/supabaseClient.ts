
import { createClient } from '@supabase/supabase-js';

// Use Ticketflow's Supabase instance
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Fallback for missing env vars
const isSupabaseConfigured = supabaseUrl && supabaseAnonKey;

if (!isSupabaseConfigured) {
    console.error('Missing Supabase environment variables for InsightsLM (Ticketflow Instance). features will not work.');
}

export const supabase = isSupabaseConfigured
    ? createClient(supabaseUrl, supabaseAnonKey)
    : createClient('https://placeholder.supabase.co', 'placeholder') as any;
