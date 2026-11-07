// src/features/voice/voiceChannels.ts
import { supabase } from '@/lib/supabase'

/** Имя комнаты детерминировано: все участники канала попадают в одну комнату. */
export const roomNameFor = (channelId: string) => `voice-${channelId}`

/**
 * Подписка на список участников голосового канала через Supabase Realtime.
 * Возвращает функцию отписки.
 */
export function subscribeToVoiceChannel(
  channelId: string,
  onChange: (userIds: string[]) => void,
): () => void {
  let alive = true

  const load = async () => {
    const { data, error } = await supabase
      .from('voice_sessions')
      .select('user_id')
      .eq('channel_id', channelId)
    if (!alive || error) return
    onChange((data ?? []).map((r) => r.user_id as string))
  }

  void load()

  const ch = supabase
    .channel(`voice_sessions:${channelId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'voice_sessions', filter: `channel_id=eq.${channelId}` },
      () => void load(),
    )
    .subscribe()

  return () => {
    alive = false
    void supabase.removeChannel(ch)
  }
}

/**
 * Вход в голосовой канал.
 * Создаёт запись в voice_sessions и возвращает имя LiveKit-комнаты.
 * upsert безопасен при повторном клике.
 */
export async function joinVoiceChannel(channelId: string, userId: string): Promise<string> {
  const roomName = roomNameFor(channelId)

  const { error } = await supabase.from('voice_sessions').upsert(
    { channel_id: channelId, user_id: userId, livekit_room: roomName },
    { onConflict: 'channel_id,user_id', ignoreDuplicates: true },
  )

  if (error) throw new Error(`Не удалось войти в канал: ${error.message}`)
  return roomName
}

/**
 * Выход из голосового канала.
 * Удаляет запись из voice_sessions.
 */
export async function leaveVoiceChannel(channelId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('voice_sessions')
    .delete()
    .eq('channel_id', channelId)
    .eq('user_id', userId)

  if (error) throw new Error(`Не удалось выйти из канала: ${error.message}`)
}
