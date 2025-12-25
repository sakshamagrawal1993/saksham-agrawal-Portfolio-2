

import { supabase as sharedClient } from '../../lib/supabaseClient';

// Use Ticketflow's Supabase instance (now shared app-wide)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Fallback for missing env vars (logic preserved for logging mainly)
const isSupabaseConfigured = supabaseUrl && supabaseAnonKey;

if (!isSupabaseConfigured) {
    console.error('Missing Supabase environment variables for InsightsLM (Ticketflow Instance). features will not work.');
}

export const supabase = sharedClient;
