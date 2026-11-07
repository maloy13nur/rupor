import { useState, useEffect, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { translateAuthError } from '@/lib/auth-errors'
import type { Profile } from '@/lib/db-types'
import type { User } from '@supabase/supabase-js'

export interface UseAuthResult {
  user: User | null
  profile: Profile | null
  loading: boolean
  error: string | null
  configured: boolean
  signUp(email: string, password: string, username: string): Promise<{ needsConfirm: boolean }>
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
  clearError(): void
}

export function useAuth(): UseAuthResult {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const configured = isSupabaseConfigured

  const loadProfile = useCallback(async (uid: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
    if (data) setProfile(data as unknown as Profile)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id).finally(() => setLoading(false))
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_ev, session) => {
      setUser(session?.user ?? null)
      if (session?.user) void loadProfile(session.user.id)
      else setProfile(null)
    })

    return () => subscription.unsubscribe()
  }, [loadProfile])

  const signUp = useCallback(async (email: string, password: string, username: string) => {
    setError(null)
    const { data: free } = await supabase.rpc('is_username_available', { p_username: username })
    if (free === false) { setError('Этот ник уже занят'); return { needsConfirm: false } }

    const { data, error: e } = await supabase.auth.signUp({
      email, password, options: { data: { username, display_name: username } },
    })
    if (e) { setError(translateAuthError(e.message, e.status)); return { needsConfirm: false } }
    return { needsConfirm: !!(data.user && !data.session) }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null)
    const { error: e } = await supabase.auth.signInWithPassword({ email, password })
    if (e) setError(translateAuthError(e.message, e.status))
  }, [])

  const signOut = useCallback(async () => {
    if (user) await supabase.from('profiles').update({ status: 'offline' }).eq('id', user.id)
    await supabase.auth.signOut()
  }, [user])

  return { user, profile, loading, error, configured, signUp, signIn, signOut, clearError: () => setError(null) }
}
