// src/features/calls/useCallSession.ts
// Отслеживание состояния исходящего звонка: ringing → active → ended/declined/missed
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Call, CallStatus } from './callsService'

export interface UseCallSessionResult {
  status: CallStatus | null
  /** Собеседник принял трубку */
  answered: boolean
  /** Звонок завершён (любым способом) */
  finished: boolean
}

/**
 * Подписка на строку звонка.
 * Нужна звонящему: он сразу входит в LiveKit-комнату,
 * но должен понимать, приняли ли трубку или отклонили.
 */
export function useCallSession(callId: string | null): UseCallSessionResult {
  const [status, setStatus] = useState<CallStatus | null>(null)
  const statusRef = useRef<CallStatus | null>(null)

  useEffect(() => {
    if (!callId) { setStatus(null); statusRef.current = null; return }
    let alive = true

    const applyStatus = (s: CallStatus) => {
      if (!alive) return
      statusRef.current = s
      setStatus(s)
    }

    // Начальное состояние
    supabase
      .from('calls')
      .select('status')
      .eq('id', callId)
      .maybeSingle()
      .then(({ data }) => { if (alive && data) applyStatus(data.status as CallStatus) })

    const ch = supabase
      .channel(`call-session:${callId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'calls', filter: `id=eq.${callId}` },
        (payload) => applyStatus((payload.new as Call).status),
      )
      .subscribe()

    // Fallback-поллинг — срабатывает если Realtime не доставил UPDATE
    const poll = setInterval(async () => {
      if (!alive) return
      const terminal: CallStatus[] = ['ended', 'declined', 'missed', 'active']
      if (statusRef.current && terminal.includes(statusRef.current)) return
      const { data } = await supabase
        .from('calls').select('status').eq('id', callId).maybeSingle()
      if (data) applyStatus(data.status as CallStatus)
    }, 3000)

    return () => {
      alive = false
      clearInterval(poll)
      void supabase.removeChannel(ch)
    }
  }, [callId])

  return {
    status,
    answered: status === 'active',
    finished: status === 'ended' || status === 'declined' || status === 'missed',
  }
}
