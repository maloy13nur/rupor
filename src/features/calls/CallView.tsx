// src/features/calls/CallView.tsx
// Экран звонка 1-на-1: ожидание ответа → разговор → завершение
import { useEffect } from 'react'
import { VoiceRoom } from '@/features/voice/VoiceRoom'
import { useCallSession } from './useCallSession'
import { Avatar } from '@/features/ui/Avatar'
import type { Profile } from '@/lib/db-types'

interface CallViewProps {
  callId: string
  room: string
  profile: Profile
  partner: Profile
  /** Кто инициировал звонок: 'caller' сразу в комнате, 'callee' уже принял */
  role: 'caller' | 'callee'
  onEnd(): void
}

/**
 * Звонящий видит «Идёт вызов…», пока собеседник не примет трубку.
 * Как только статус стал active — подключаемся к LiveKit.
 * Если отклонили/пропустили — выходим автоматически.
 */
export function CallView({ callId, room, profile, partner, role, onEnd }: CallViewProps) {
  const { status, answered, finished } = useCallSession(callId)

  // Собеседник отклонил или не ответил — закрываем экран
  useEffect(() => {
    if (finished) {
      const t = setTimeout(onEnd, 1200)
      return () => clearTimeout(t)
    }
  }, [finished, onEnd])

  const partnerName = partner.display_name || partner.username

  // Отклонён или пропущен
  if (finished) {
    const label =
      status === 'declined' ? 'Звонок отклонён' :
      status === 'missed' ? 'Нет ответа' : 'Звонок завершён'
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-ink-900">
        <Avatar
          username={partner.username}
          displayName={partner.display_name}
          avatarUrl={partner.avatar_url}
          size="lg"
        />
        <div className="text-center">
          <p className="text-sm font-medium text-fog-100">{partnerName}</p>
          <p className="mt-1 text-xs text-fog-400">{label}</p>
        </div>
      </div>
    )
  }

  // Звонящий ждёт ответа — в LiveKit ещё не входим
  if (role === 'caller' && !answered) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-ink-900 bg-[radial-gradient(ellipse_at_top,_#1a1d2e_0%,_#0f1117_60%)]">
        <div className="relative grid place-items-center">
          <span className="absolute size-32 animate-ping rounded-full bg-accent/10" style={{ animationDuration: '2s' }} />
          <span className="absolute size-24 animate-ping rounded-full bg-accent/15" style={{ animationDuration: '2s', animationDelay: '0.3s' }} />
          <span className="absolute size-16 animate-ping rounded-full bg-accent/20" style={{ animationDuration: '2s', animationDelay: '0.6s' }} />
          <Avatar
            username={partner.username}
            displayName={partner.display_name}
            avatarUrl={partner.avatar_url}
            size="lg"
          />
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-fog-100">{partnerName}</p>
          <p className="mt-1 text-xs text-fog-400 tracking-widest uppercase">Идёт вызов…</p>
        </div>
        <button
          onClick={onEnd}
          className="flex items-center gap-2 rounded-full bg-dnd px-6 py-3 text-sm font-semibold
                     text-white shadow-lg shadow-dnd/30 transition-all hover:bg-dnd/80 active:scale-95"
        >
          <span className="text-base">📵</span> Отменить
        </button>
      </div>
    )
  }

  // Собеседник принял (или мы — callee) → полноценная комната
  return (
    <VoiceRoom
      roomName={room}
      participantName={profile.display_name || profile.username}
      callMode
      callPartnerName={partnerName}
      onLeave={onEnd}
    />
  )
}
