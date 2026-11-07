// src/features/voice/livekit.ts
import { supabase } from '@/lib/supabase'

/** WebSocket-URL LiveKit-сервера. Задаётся в .env.local */
export const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL as string ?? 'wss://localhost:7880'

/**
 * Получение access-токена для входа в комнату.
 *
 * В проде токен генерирует Supabase Edge Function `livekit-token`,
 * которая проверяет JWT пользователя и подписывает токен секретом LiveKit —
 * секрет никогда не попадает в бандл клиента.
 *
 * Для локального dev-сервера LiveKit (devkey/secret) можно временно
 * выставить VITE_LIVEKIT_DEV=true и генерировать токен прямо здесь
 * через livekit-server-sdk, но потребуется vite-plugin-node-polyfills.
 */
export async function getToken(roomName: string, participantName: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Нужно войти в аккаунт')

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ room: roomName, name: participantName }),
    },
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Не удалось получить токен LiveKit: ${text}`)
  }

  const { token } = (await res.json()) as { token: string }
  return token
}
