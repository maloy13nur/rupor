// src/features/calls/useIncomingCall.ts
// Хук: слушает входящие звонки через Realtime, управляет состоянием ринга
import { useState, useEffect, useCallback } from 'react'
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
    return unsub
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
      // Если ответить не удалось — восстанавливаем только если звонок ещё ringing
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
