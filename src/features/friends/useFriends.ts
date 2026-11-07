// src/features/friends/useFriends.ts
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchFriends, fetchPendingRequests, type FriendWithProfile } from './friendsService'

export interface UseFriendsResult {
  friends: FriendWithProfile[]
  pending: FriendWithProfile[]
  loading: boolean
  error: string | null
  refresh(): Promise<void>
}

export function useFriends(myId: string | null): UseFriendsResult {
  const [friends, setFriends] = useState<FriendWithProfile[]>([])
  const [pending, setPending] = useState<FriendWithProfile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const refresh = useCallback(async () => {
    if (!myId) {
      setFriends([])
      setPending([])
      return
    }
    setLoading(true)
    try {
      const [f, p] = await Promise.all([fetchFriends(myId), fetchPendingRequests(myId)])
      if (!mountedRef.current) return
      setFriends(f)
      setPending(p)
      setError(null)
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [myId])

  useEffect(() => {
    mountedRef.current = true
    void refresh()
    return () => { mountedRef.current = false }
  }, [refresh])

  // Realtime: инвалидация при изменении friendships
  useEffect(() => {
    if (!myId) return
    const ch = supabase
      .channel(`friends-watch:${myId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' },
        () => void refresh())
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [myId, refresh])

  return { friends, pending, loading, error, refresh }
}
