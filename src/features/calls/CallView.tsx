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
      <div className="relative flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden bg-ink-900">
        <div className="pointer-events-none absolute -top-24 left-1/2 size-[420px] -translate-x-1/2 rounded-full bg-accent/8 blur-[120px]" />
        <Avatar
          username={partner.username}
          displayName={partner.display_name}
          avatarUrl={partner.avatar_url}
          size="lg"
        />
        <div className="relative text-center">
          <p className="text-sm font-semibold text-fog-100">{partnerName}</p>
          <p className="mt-1 text-xs text-fog-400">{label}</p>
        </div>
      </div>
    )
  }

  // Звонящий ждёт ответа — в LiveKit ещё не входим
  if (role === 'caller' && !answered) {
    return (
      <div className="relative flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden
                      bg-ink-900 bg-[radial-gradient(ellipse_at_top,_rgb(124_92_255_/_0.13)_0%,_#07080d_65%)]">
        <div className="relative grid place-items-center">
          <span className="absolute size-32 animate-ping rounded-full bg-accent/12" style={{ animationDuration: '2s' }} />
          <span className="absolute size-24 animate-ping rounded-full bg-accent/18" style={{ animationDuration: '2s', animationDelay: '0.3s' }} />
          <span className="absolute size-16 animate-ping rounded-full bg-accent/25" style={{ animationDuration: '2s', animationDelay: '0.6s' }} />
          <Avatar
            username={partner.username}
            displayName={partner.display_name}
            avatarUrl={partner.avatar_url}
            size="lg"
          />
        </div>
        <div className="relative text-center">
          <p className="text-base font-semibold text-fog-100">{partnerName}</p>
          <p className="mt-1.5 text-[11px] uppercase tracking-[0.18em] text-fog-400">Идёт вызов…</p>
        </div>
        <button
          onClick={onEnd}
          className="relative flex items-center gap-2 rounded-full bg-dnd px-6 py-3 text-sm font-semibold
                     text-white shadow-[0_12px_32px_-12px_rgb(239_68_68/0.9)]
                     transition-all hover:brightness-110 active:scale-95"
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
