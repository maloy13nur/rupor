import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { cache } from '@/lib/data-cache'
import { fetchMyServers, type ServerWithChannels } from './groupsService'

const CACHE_KEY = 'servers-tree'
const TTL = 60_000

export interface UseServersTreeResult {
  servers: ServerWithChannels[]
  loading: boolean        // true только когда кэша нет вообще
  revalidating: boolean   // фоновое обновление
  error: string | null
  refresh(): Promise<void>
}

export function useServersTree(): UseServersTreeResult {
  const [servers, setServers] = useState<ServerWithChannels[]>(
    () => cache.get<ServerWithChannels[]>(CACHE_KEY, { allowStale: true }) ?? []
  )
  const [loading, setLoading] = useState(() => !cache.get(CACHE_KEY, { allowStale: true }))
  const [revalidating, setRevalidating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const doFetch = useCallback(async () => {
    if (!mountedRef.current) return
    setRevalidating(true)
    try {
      const data = await fetchMyServers()
      if (!mountedRef.current) return
      // persist: дерево серверов нужно сразу на старте, заново с нуля
      cache.set(CACHE_KEY, data, TTL, true)
      setServers(data)
      setError(null)
    } catch (e) {
      if (!mountedRef.current) return
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (mountedRef.current) {
        setLoading(false)
        setRevalidating(false)
      }
    }
  }, [])

  // Начальная загрузка
  useEffect(() => {
    mountedRef.current = true
    // Если в кэше ничего нет — загружаем. Если есть stale — фоновое обновление.
    if (cache.isStale(CACHE_KEY)) {
      void doFetch()
    } else {
      setLoading(false)
    }
    return () => { mountedRef.current = false }
  }, [doFetch])

  // Realtime-подписка: members, servers, channels
  useEffect(() => {
    const scheduleRefresh = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        cache.invalidate(CACHE_KEY)
        void doFetch()
      }, 300)
    }

    let ch: ReturnType<typeof supabase.channel> | null = null
    let alive = true

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!alive) return
      const myId = session?.user.id
      let channel = supabase.channel('servers-tree-watch')

      // members без фильтра — это уведомление о каждом вступлении любого
      // пользователя в любой сервер. Слушаем только свои членства.
      if (myId) {
        channel = channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'members', filter: `user_id=eq.${myId}` },
          scheduleRefresh,
        )
      }
      channel = channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'servers' }, scheduleRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'channels' }, scheduleRefresh)
        .subscribe()
      ch = channel
    })

    return () => {
      alive = false
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (ch) void supabase.removeChannel(ch)
    }
  }, [doFetch])

  return { servers, loading, revalidating, error, refresh: doFetch }
}
