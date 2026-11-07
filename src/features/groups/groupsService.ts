import { supabase } from '@/lib/supabase'
import type { Channel, Member, Server, ProfileBrief } from '@/lib/db-types'

export class GroupError extends Error {
  readonly code: string
  readonly cause?: unknown
  constructor(code: string, message: string, cause?: unknown) {
    super(message)
    this.name = 'GroupError'
    this.code = code
    this.cause = cause
  }
}

export interface ServerWithChannels {
  server: Server
  channels: Channel[]
  role: Member['role']
}

export async function fetchMyServers(): Promise<ServerWithChannels[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new GroupError('UNAUTHENTICATED', 'Нужно войти')

  const { data: memberRows, error: mErr } = await supabase
    .from('members').select('server_id, role').eq('user_id', user.id)
  if (mErr) throw new GroupError('DB', mErr.message, mErr)
  if (!memberRows?.length) return []

  const ids = memberRows.map((m) => m.server_id as string)
  const roleOf = new Map(memberRows.map((m) => [m.server_id as string, m.role as Member['role']]))

  const [serversRes, channelsRes] = await Promise.all([
    supabase.from('servers').select('*').in('id', ids),
    supabase.from('channels').select('*').in('server_id', ids).order('position', { ascending: true }),
  ])

  if (serversRes.error) throw new GroupError('DB', serversRes.error.message, serversRes.error)
  if (channelsRes.error) throw new GroupError('DB', channelsRes.error.message, channelsRes.error)

  return (serversRes.data ?? []).map((server) => ({
    server: server as unknown as Server,
    role: roleOf.get(server.id as string) ?? 'MEMBER',
    channels: (channelsRes.data ?? []).filter((c) => c.server_id === server.id) as unknown as Channel[],
  }))
}

export async function createServer(name: string): Promise<Server> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new GroupError('UNAUTHENTICATED', 'Нужно войти')

  // INSERT без RETURNING: AFTER-триггер добавляет owner в members,
  // но SELECT-политика (is_member) видит это только после триггера.
  // Обходим: insert minimal → затем select по client-side UUID.
  const id = crypto.randomUUID()
  const { error } = await supabase.from('servers').insert({ id, name: name.trim(), owner_id: user.id })
  if (error) throw new GroupError('DB', error.message, error)

  const { data, error: readErr } = await supabase.from('servers').select('*').eq('id', id).single()
  if (readErr) throw new GroupError('DB', readErr.message, readErr)
  return data as unknown as Server
}

export async function joinServerByCode(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_server', { p_code: code.trim() })
  if (error) {
    throw new GroupError(
      error.message.includes('SERVER_NOT_FOUND') ? 'NOT_FOUND' : 'DB',
      error.message.includes('SERVER_NOT_FOUND') ? 'Код не подошёл' : error.message,
      error,
    )
  }
  return data as string
}

export async function createChannel(serverId: string, name: string, type: 'TEXT' | 'VOICE' = 'TEXT'): Promise<Channel> {
  const { data, error } = await supabase
    .from('channels')
    .insert({ server_id: serverId, name: name.trim().toLowerCase().replace(/\s+/g, '-'), type })
    .select().single()
  if (error) throw new GroupError('DB', error.message, error)
  return data as unknown as Channel
}

export async function fetchServerMembers(serverId: string): Promise<Array<ProfileBrief & { role: Member['role'] }>> {
  const { data, error } = await supabase
    .from('members')
    .select('role, profile:profiles!members_user_id_fkey(id,username,display_name,avatar_url,status)')
    .eq('server_id', serverId)
  if (error) throw new GroupError('DB', error.message, error)
  return (data ?? []).flatMap((row) => {
    const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile
    if (!profile) return []
    return [{ ...(profile as ProfileBrief), role: row.role as Member['role'] }]
  })
}
