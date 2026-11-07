// src/features/dm/useDmChannels.ts
// Список существующих личных переписок пользователя (для сайдбара)
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { cache } from '@/lib/data-cache'
import type { DmChannel, Profile } from '@/lib/db-types'

export interface DmConversation {
  dm: DmChannel
  /** Собеседник */
  peer: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url' | 'status'>
  /** Последнее сообщение и его время */
  lastMessage: string | null
  lastMessageAt: string | null
}

const cacheKey = (myId: string) => `dm-list:${myId}`

export interface UseDmChannelsResult {
  conversations: DmConversation[]
  loading: boolean
  error: string | null
  refresh(): Promise<void>
}

export function useDmChannels(myId: string | null): UseDmChannelsResult {
  const [conversations, setConversations] = useState<DmConversation[]>(
    () => (myId ? cache.get<DmConversation[]>(cacheKey(myId), { allowStale: true }) ?? [] : []),
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const refresh = useCallback(async () => {
    if (!myId) return
    setLoading(true)
    try {
      // 1. Все DM-каналы, где я участник
      const { data: dms, error: dmErr } = await supabase
        .from('dm_channels')
        .select('*')
        .or(`participant_a.eq.${myId},participant_b.eq.${myId}`)
      if (dmErr) throw new Error(dmErr.message)

      const rows = (dms ?? []) as unknown as DmChannel[]
      if (!rows.length) {
        if (mountedRef.current) { setConversations([]); setError(null); setLoading(false) }
        return
      }

      // 2. Профили собеседников одним запросом
      const peerIds = [...new Set(rows.map((d) => (d.participant_a === myId ? d.participant_b : d.participant_a)))]
      const { data: peers, error: pErr } = await supabase
        .from('profiles')
        .select('id,username,display_name,avatar_url,status')
        .in('id', peerIds)
      if (pErr) throw new Error(pErr.message)
      const peerMap = new Map((peers ?? []).map((p) => [p.id as string, p]))

      // 3. Последние сообщения — по одному запросу на канал (их обычно немного)
      const withLast = await Promise.all(
        rows.map(async (dm) => {
          const { data: last } = await supabase
            .from('dm_messages')
            .select('content,created_at')
            .eq('channel_id', dm.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          const peerId = dm.participant_a === myId ? dm.participant_b : dm.participant_a
          const peer = peerMap.get(peerId)
          if (!peer) return null
          return {
            dm,
            peer: peer as DmConversation['peer'],
            lastMessage: (last?.content as string | undefined) ?? null,
            lastMessageAt: (last?.created_at as string | undefined) ?? null,
          } satisfies DmConversation
        }),
      )

      // 4. Сортировка: свежие переписки сверху
      const list = withLast
        .filter((x): x is DmConversation => x !== null)
        .sort((a, b) => {
          const ta = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0
          const tb = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0
          return tb - ta
        })

      if (!mountedRef.current) return
      setConversations(list)
      cache.set(cacheKey(myId), list, 60_000)
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

  // Realtime: новые сообщения и новые DM-каналы обновляют список
  useEffect(() => {
    if (!myId) return
    const ch = supabase
      .channel(`dm-list-watch:${myId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_messages' }, () => {
        cache.invalidate(cacheKey(myId))
        void refresh()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_channels' }, () => {
        cache.invalidate(cacheKey(myId))
        void refresh()
      })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [myId, refresh])

  return { conversations, loading, error, refresh }
}
