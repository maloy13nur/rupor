import { createClient } from '@supabase/supabase-js'

const rawUrl = import.meta.env.VITE_SUPABASE_URL as string ?? ''
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string ?? ''

export const isSupabaseConfigured =
  /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(rawUrl) &&
  rawKey.length > 20 &&
  !rawKey.includes('your-anon-key')

export const supabase = isSupabaseConfigured
  ? createClient(rawUrl, rawKey, {
      auth: {
        detectSessionInUrl: false,
        flowType: 'pkce',
        storageKey: 'rupor.auth',
      },
    })
  : createClient('https://placeholder.supabase.co', 'placeholder-key', {
      auth: { detectSessionInUrl: false, storageKey: 'rupor.auth' },
    })
