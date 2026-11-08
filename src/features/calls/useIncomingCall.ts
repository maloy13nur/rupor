// src/features/calls/useIncomingCall.ts
// Хук: слушает входящие звонки через Realtime, управляет состоянием ринга
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { subscribeToIncomingCalls, endCall, answerCall, type Call } from './callsService'

export interface UseIncomingCallResult {
  /** Текущий входящий звонок (ringing) */
  incomingCall: Call | null
  /** Принять → вернёт имя LiveKit-комнаты */
  accept(): Promise<string | null>
  /** Отклонить */
  decline(): Promise<void>
}

export function useIncomingCall(userId: string | null): UseIncomingCallResult {
  const [incomingCall, setIncomingCall] = useState<Call | null>(null)

  useEffect(() => {
    if (!userId) return
    let alive = true

    // Если звонок начался, пока приложение ещё подключало Realtime,
    // событие INSERT уже прошло и мы бы его никогда не увидели.
    // Дочитываем актуальные входящие при старте подписки.
    void supabase
      .from('calls')
      .select('*')
      .eq('callee_id', userId)
      .eq('status', 'ringing')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive || !data) return
        // Показываем только свежие: зависший звонок не должен висеть вечно
        const age = Date.now() - Date.parse(data.created_at as string)
        if (age < 60_000) setIncomingCall(data as unknown as Call)
      })

    const unsub = subscribeToIncomingCalls(
      userId,
      (call) => {
        // Новый входящий звонок
        if (call.status === 'ringing') setIncomingCall(call)
      },
      (call) => {
        // Обновление: если уже не ringing — убираем
        if (call.status !== 'ringing') {
          setIncomingCall((prev) => prev?.id === call.id ? null : prev)
        }
      },
    )
    return () => { alive = false; unsub() }
  }, [userId])

  const accept = useCallback(async (): Promise<string | null> => {
    if (!incomingCall) return null
    const call = incomingCall
    // Убираем уведомление сразу — не ждём Realtime UPDATE
    setIncomingCall(null)
    try {
      const room = await answerCall(call.id)
      return room
    } catch {
      // Не смогли ответить (звонок уже отменён или сеть) — возвращаем
      // только если он всё ещё звонит, чтобы не показывать «призрак».
      const { data } = await supabase
        .from('calls').select('id,status').eq('id', call.id).maybeSingle()
      if (data?.status === 'ringing') setIncomingCall(call)
      return null
    }
  }, [incomingCall])

  const decline = useCallback(async (): Promise<void> => {
    if (!incomingCall) return
    await endCall(incomingCall.id, 'declined').catch(() => null)
    setIncomingCall(null)
  }, [incomingCall])

  return { incomingCall, accept, decline }
}
