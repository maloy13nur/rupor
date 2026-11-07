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
      cache.set(CACHE_KEY, data, TTL)
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

    const ch = supabase
      .channel('servers-tree-watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'servers' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channels' }, scheduleRefresh)
      .subscribe()

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      void supabase.removeChannel(ch)
    }
  }, [doFetch])

  return { servers, loading, revalidating, error, refresh: doFetch }
}
