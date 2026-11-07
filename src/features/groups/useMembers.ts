import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { cache } from '@/lib/data-cache'
import type { ProfileBrief, Member } from '@/lib/db-types'

export type MemberWithRole = ProfileBrief & { role: Member['role'] }

const ROLE_ORDER: Record<Member['role'], number> = { OWNER: 0, ADMIN: 1, MEMBER: 2 }
const PAGE_SIZE = 50

function cacheKey(serverId: string, page: number) {
  return `members:${serverId}:${page}`
}

export interface UseMembersResult {
  members: MemberWithRole[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  error: string | null
  loadMore(): void
  refresh(): void
}

export function useMembers(serverId: string | null, pageSize = PAGE_SIZE): UseMembersResult {
  const [members, setMembers] = useState<MemberWithRole[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pageRef = useRef(0)
  const mountedRef = useRef(true)

  const sortMembers = (arr: MemberWithRole[]): MemberWithRole[] =>
    [...arr].sort((a, b) =>
      ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
      a.username.localeCompare(b.username)
    )

  const fetchPage = useCallback(async (sid: string, page: number): Promise<MemberWithRole[]> => {
    // Проверяем кэш
    const cached = cache.get<MemberWithRole[]>(cacheKey(sid, page), { allowStale: true })
    if (cached && !cache.isStale(cacheKey(sid, page))) return cached

    const from = page * pageSize
    const to = from + pageSize - 1

    const { data, error: err } = await supabase
      .from('members')
      .select('role, profile:profiles!members_user_id_fkey(id,username,display_name,avatar_url,status)')
      .eq('server_id', sid)
      .order('joined_at', { ascending: true })
      .range(from, to)

    if (err) throw new Error(err.message)

    const rows = (data ?? []).flatMap((row) => {
      const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile
      if (!profile) return []
      return [{ ...(profile as ProfileBrief), role: row.role as Member['role'] }]
    })

    cache.set(cacheKey(sid, page), rows, 60_000)
    return rows
  }, [pageSize])

  // Загрузка первой страницы при смене сервера
  useEffect(() => {
    if (!serverId) {
      setMembers([])
      setHasMore(true)
      return
    }
    mountedRef.current = true
    pageRef.current = 0

    // Показываем из кэша мгновенно
    const cached = cache.get<MemberWithRole[]>(cacheKey(serverId, 0), { allowStale: true })
    if (cached) {
      setMembers(sortMembers(cached))
      setLoading(false)
    } else {
      setLoading(true)
    }

    fetchPage(serverId, 0)
      .then((rows) => {
        if (!mountedRef.current) return
        setMembers(sortMembers(rows))
        setHasMore(rows.length === pageSize)
        setLoading(false)
      })
      .catch((e) => {
        if (!mountedRef.current) return
        setError(e instanceof Error ? e.message : String(e))
        setLoading(false)
      })

    return () => { mountedRef.current = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId])

  const loadMore = useCallback(() => {
    if (!serverId || loadingMore || !hasMore) return
    const nextPage = pageRef.current + 1
    setLoadingMore(true)
    fetchPage(serverId, nextPage)
      .then((rows) => {
        if (!mountedRef.current) return
        pageRef.current = nextPage
        setMembers((prev) => {
          // Дедупликация по id
          const ids = new Set(prev.map((m) => m.id))
          const fresh = rows.filter((m) => !ids.has(m.id))
          return sortMembers([...prev, ...fresh])
        })
        setHasMore(rows.length === pageSize)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => { if (mountedRef.current) setLoadingMore(false) })
  }, [serverId, loadingMore, hasMore, fetchPage, pageSize])

  const refresh = useCallback(() => {
    if (!serverId) return
    cache.invalidatePrefix(`members:${serverId}:`)
    pageRef.current = 0
    setLoading(true)
    fetchPage(serverId, 0)
      .then((rows) => {
        if (!mountedRef.current) return
        setMembers(sortMembers(rows))
        setHasMore(rows.length === pageSize)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => { if (mountedRef.current) setLoading(false) })
  }, [serverId, fetchPage, pageSize])

  // Realtime: инвалидация при изменении состава сервера
  useEffect(() => {
    if (!serverId) return
    const ch = supabase
      .channel(`members-watch:${serverId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'members', filter: `server_id=eq.${serverId}` },
        () => {
          cache.invalidatePrefix(`members:${serverId}:`)
          refresh()
        })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [serverId, refresh])

  return { members, loading, loadingMore, hasMore, error, loadMore, refresh }
}
