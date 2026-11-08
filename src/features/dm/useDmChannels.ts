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

      // 3. Последние сообщения — одним запросом на все каналы сразу.
      // Раньше здесь был запрос на каждый канал (N+1) — при десятке
      // переписок старт растягивался на секунды.
      const channelIds = rows.map((d) => d.id)
      const { data: lastRows } = await supabase
        .from('dm_messages')
        .select('channel_id,content,created_at')
        .in('channel_id', channelIds)
        .order('created_at', { ascending: false })
        .limit(Math.max(channelIds.length * 10, 100))

      // Первое (самое свежее) сообщение по каждому каналу
      const lastByChannel = new Map<string, { content: string; created_at: string }>()
      for (const m of (lastRows ?? []) as Array<{ channel_id: string; content: string; created_at: string }>) {
        if (!lastByChannel.has(m.channel_id)) lastByChannel.set(m.channel_id, m)
      }

      const withLast: DmConversation[] = rows.flatMap((dm) => {
        const peerId = dm.participant_a === myId ? dm.participant_b : dm.participant_a
        const peer = peerMap.get(peerId)
        if (!peer) return []
        const last = lastByChannel.get(dm.id)
        return [{
          dm,
          peer: peer as DmConversation['peer'],
          lastMessage: last?.content ?? null,
          lastMessageAt: last?.created_at ?? null,
        }]
      })

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
      cache.set(cacheKey(myId), list, 60_000, true)
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

  // Realtime: новые сообщения и новые DM-каналы обновляют список.
  // Подписка идёт без серверного фильтра (in.(...) тяжело держать
  // актуальным), но событие отсекается на клиенте по списку своих каналов —
  // иначе любое сообщение в системе перезагружало бы весь список.
  const myChannelIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    myChannelIdsRef.current = new Set(conversations.map((c) => c.dm.id))
  }, [conversations])

  useEffect(() => {
    if (!myId) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        cache.invalidate(cacheKey(myId))
        void refresh()
      }, 250)
    }

    const ch = supabase
      .channel(`dm-list-watch:${myId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_messages' },
        (payload) => {
          const channelId = (payload.new as { channel_id?: string })?.channel_id
          // Сообщение из незнакомого канала — это либо новый диалог
          // (придёт событие dm_channels), либо чужая переписка.
          if (!channelId) return
          if (myChannelIdsRef.current.size === 0) return
          if (!myChannelIdsRef.current.has(channelId)) return
          scheduleRefresh()
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_channels' }, scheduleRefresh)
      .subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      void supabase.removeChannel(ch)
    }
  }, [myId, refresh])

  return { conversations, loading, error, refresh }
}
