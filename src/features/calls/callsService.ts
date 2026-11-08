// src/features/calls/callsService.ts
import { supabase } from '@/lib/supabase'

export type CallStatus = 'ringing' | 'active' | 'ended' | 'missed' | 'declined'

export interface Call {
  id: string
  caller_id: string
  callee_id: string
  status: CallStatus
  livekit_room: string
  started_at: string | null
  ended_at: string | null
  created_at: string
}

/**
 * Завершает зависшие звонки между двумя пользователями.
 * RPC может отсутствовать/упасть — тогда пробуем прямой UPDATE
 * (RLS позволяет менять статус обоим участникам).
 */
async function clearStaleCalls(myId: string, calleeId: string): Promise<void> {
  const { data: stale } = await supabase
    .from('calls')
    .select('id')
    .in('status', ['ringing', 'active'])
    .or(
      `and(caller_id.eq.${myId},callee_id.eq.${calleeId}),` +
      `and(caller_id.eq.${calleeId},callee_id.eq.${myId})`,
    )
  if (!stale?.length) return

  await Promise.all(
    stale.map(async ({ id }) => {
      const { error } = await supabase.rpc('end_call', { p_call_id: id, p_status: 'ended' })
      if (!error) return
      // fallback: прямой UPDATE
      await supabase
        .from('calls')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', id)
        .in('status', ['ringing', 'active'])
    }),
  )
}

/** Инициировать звонок — возвращает id звонка */
export async function initiateCall(calleeId: string): Promise<{ callId: string; room: string }> {
  const { data: callId, error } = await supabase.rpc('initiate_call', { p_callee_id: calleeId })
  if (error) {
    if (error.message.includes('CALL_ALREADY_ACTIVE')) {
      // Завис старый звонок — чистим и пробуем снова
      const myId = (await supabase.auth.getSession()).data.session?.user.id
      if (myId) await clearStaleCalls(myId, calleeId)
      const { data: callId2, error: e2 } = await supabase.rpc('initiate_call', { p_callee_id: calleeId })
      if (e2) throw new Error(e2.message)
      const { data: row2, error: e3 } = await supabase
        .from('calls').select('livekit_room').eq('id', callId2 as string).single()
      if (e3) throw new Error(e3.message)
      return { callId: callId2 as string, room: (row2 as { livekit_room: string }).livekit_room }
    }
    throw new Error(error.message)
  }
  const { data: row, error: e2 } = await supabase
    .from('calls').select('livekit_room').eq('id', callId as string).single()
  if (e2) throw new Error(e2.message)
  return { callId: callId as string, room: (row as { livekit_room: string }).livekit_room }
}

/** Принять звонок — возвращает имя LiveKit-комнаты */
export async function answerCall(callId: string): Promise<string> {
  const { data, error } = await supabase.rpc('answer_call', { p_call_id: callId })
  if (error) throw new Error(error.message)
  return data as string
}

/** Завершить или отклонить звонок */
export async function endCall(callId: string, status: 'ended' | 'declined' | 'missed' = 'ended'): Promise<void> {
  const { error } = await supabase.rpc('end_call', { p_call_id: callId, p_status: status })
  if (error) throw new Error(error.message)
}

/** Подписка на входящие звонки для текущего пользователя */
export function subscribeToIncomingCalls(
  userId: string,
  onIncoming: (call: Call) => void,
  onUpdated: (call: Call) => void,
): () => void {
  const ch = supabase
    .channel(`calls:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'calls', filter: `callee_id=eq.${userId}` },
      (payload) => onIncoming(payload.new as Call),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'calls', filter: `callee_id=eq.${userId}` },
      (payload) => onUpdated(payload.new as Call),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'calls', filter: `caller_id=eq.${userId}` },
      (payload) => onUpdated(payload.new as Call),
    )
    .subscribe()
  return () => { void supabase.removeChannel(ch) }
}
