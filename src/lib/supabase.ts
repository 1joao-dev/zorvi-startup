import { createClient } from "@supabase/supabase-js";

// These are Supabase client-side identifiers. The publishable key is designed
// to be exposed in browser apps; never place a service_role/secret key here.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://pmciixclguadvkfhndcf.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_9Lh6YODUy-1BRWqIi7lWvQ_aPVo70S7";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
