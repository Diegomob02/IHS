import { createClient } from '@supabase/supabase-js';
import { getPublicSupabaseConfig } from '../utils/env';

const { supabaseUrl, supabaseAnonKey } = getPublicSupabaseConfig();

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing Supabase environment variables. Check your .env file.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  }
);

try {
  const host = (supabaseUrl || '').replace(/^https?:\/\//, '');
  const projectRef = host.split('.')[0] || null;
  (window as any).IHS_PUBLIC_CONFIG = {
    supabaseUrl: supabaseUrl || null,
    supabaseProjectRef: projectRef,
  };
} catch {
  (window as any).IHS_PUBLIC_CONFIG = {
    supabaseUrl: supabaseUrl || null,
    supabaseProjectRef: null,
  };
}

if (import.meta.env.DEV) {
  (window as any).supabase = supabase;
}

if (String((import.meta as any)?.env?.VITE_DEBUG_SUPABASE || '').toLowerCase() === 'true') {
  (window as any).supabase = supabase;
}
