// src/features/voice/VoiceRoom.tsx
import { useEffect, useState, type ReactNode } from 'react'
import { Avatar } from '@/features/ui/Avatar'
import { getToken } from './livekit'
import { useVoice } from './useVoice'
import { ScreenSharePreview } from './ScreenSharePreview'

interface VoiceRoomProps {
  roomName: string
  participantName: string
  /** Режим личного звонка 1-на-1 — упрощённый UI */
  callMode?: boolean
  /** Имя собеседника для заголовка в режиме звонка */
  callPartnerName?: string
  onLeave(): void
}

/**
 * Компонент голосовой комнаты.
 * Получает LiveKit-токен → подключается через useVoice →
 * показывает участников, кнопки управления и превью шаринга.
 */
export function VoiceRoom({ roomName, participantName, callMode, callPartnerName, onLeave }: VoiceRoomProps) {
  const [token, setToken] = useState<string | null>(null)
  const [tokenError, setTokenError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setToken(null)
    setTokenError(null)
    getToken(roomName, participantName)
      .then((t) => { if (!cancelled) setToken(t) })
      .catch((e: unknown) => {
        if (!cancelled) setTokenError(e instanceof Error ? e.message : String(e))
      })
    return () => { cancelled = true }
  }, [roomName, participantName])

  if (tokenError) {
    return (
      <Overlay>
        <p className="text-sm text-dnd">{tokenError}</p>
        <button onClick={onLeave} className="btn-secondary">Назад</button>
      </Overlay>
    )
  }

  if (!token) {
    return (
      <Overlay>
        <Spinner />
        <p className="text-sm text-fog-400">Подключение к каналу…</p>
        <button onClick={onLeave} className="btn-secondary !px-3 !py-1.5 !text-xs">Отмена</button>
      </Overlay>
    )
  }

  return (
    <VoiceRoomInner
      roomName={roomName}
      token={token}
      participantName={participantName}
      callMode={callMode}
      callPartnerName={callPartnerName}
      onLeave={onLeave}
    />
  )
}

function Spinner() {
  return <div className="size-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
}

function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden bg-ink-900">
      <div className="pointer-events-none absolute -top-24 left-1/2 size-[420px] -translate-x-1/2 rounded-full bg-accent/10 blur-[110px]" />
      <div className="relative flex flex-col items-center gap-4">{children}</div>
    </div>
  )
}

// ── Внутренний компонент: подключён к Room ─────────────────────────────────

interface InnerProps {
  roomName: string
  token: string
  participantName: string
  callMode?: boolean
  callPartnerName?: string
  onLeave(): void
}

function VoiceRoomInner({ roomName, token, participantName, callMode, callPartnerName, onLeave }: InnerProps) {
  const v = useVoice(roomName, token)

  const handleLeave = () => {
    v.disconnect()
    onLeave()
  }

  if (v.connecting) {
    return (
      <Overlay>
        <Spinner />
        <p className="text-sm text-fog-400">Соединение…</p>
        <button onClick={handleLeave} className="btn-secondary !px-3 !py-1.5 !text-xs">Отмена</button>
      </Overlay>
    )
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-ink-900">
      {/* Мягкое свечение сверху */}
      <div className="pointer-events-none absolute -top-32 left-1/2 size-[520px] -translate-x-1/2 rounded-full bg-accent/8 blur-[130px]" />

      {/* Заголовок */}
      <header className="relative flex h-14 flex-shrink-0 items-center justify-between border-b border-white/7 bg-ink-800/85 px-5 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-online shadow-[0_0_8px_rgb(34_197_94/0.9)]" />
          <span className="text-[14.5px] font-semibold text-fog-100">
            {callMode && callPartnerName ? `Звонок с ${callPartnerName}` : 'Голосовой канал'}
          </span>
        </div>
        <span className="rounded-md bg-white/6 px-2 py-0.5 text-[11px] tabular-nums text-fog-300">
          {v.remoteParticipants.length + 1} участн.
        </span>
      </header>

      {/* Ошибка */}
      {v.error && (
        <div className="relative mx-5 mt-3 rounded-lg border border-dnd/25 bg-dnd/12 px-3 py-2 text-xs text-dnd">
          {v.error}
        </div>
      )}

      {/* Сетка участников */}
      <div className="relative flex-1 overflow-y-auto p-5 scrollbar-thin">
        <div className="grid grid-cols-3 gap-5 sm:grid-cols-4 md:grid-cols-5">
          {/* Локальный участник */}
          {v.localParticipant && (
            <ParticipantCard
              identity={v.localParticipant.identity}
              name={participantName}
              speaking={v.localParticipant.isSpeaking}
              muted={v.isMuted}
              isLocal
            />
          )}
          {/* Удалённые участники */}
          {v.remoteParticipants.map((p) => (
            <ParticipantCard
              key={p.identity}
              identity={p.identity}
              name={p.name ?? p.identity}
              speaking={p.isSpeaking}
              muted={!p.isMicrophoneEnabled}
            />
          ))}
        </div>
      </div>

      {/* Мини-превью шаринга экрана — правый нижний угол */}
      {v.isSharingScreen && v.screenTrack && (
        <div className="absolute bottom-24 right-5 z-10 drop-shadow-2xl">
          <ScreenSharePreview track={v.screenTrack} />
        </div>
      )}

      {/* Панель управления */}
      <footer className="relative flex items-center justify-center gap-2.5 border-t border-white/7 bg-ink-800/85 px-5 py-4 backdrop-blur-md">
        <ControlBtn
          active={v.isMuted}
          activeClass="bg-dnd text-white shadow-[0_8px_22px_-10px_rgb(239_68_68/0.9)]"
          onClick={v.toggleMute}
        >
          {v.isMuted ? '🔇 Включить' : '🎙 Выкл. микр.'}
        </ControlBtn>

        <ControlBtn
          active={v.isSharingScreen}
          activeClass="bg-grad text-white shadow-[0_8px_22px_-10px_rgb(var(--grad-a)/0.9)]"
          onClick={() => void v.toggleScreenShare()}
        >
          {v.isSharingScreen ? '🖥 Остановить' : '🖥 Шаринг'}
        </ControlBtn>

        <button onClick={handleLeave} className="btn-danger !px-3.5 !py-2 !text-[13px]">
          Выйти
        </button>
      </footer>
    </div>
  )
}

// ── Карточка участника ──────────────────────────────────────────────────────

function ParticipantCard({
  identity, name, speaking, muted, isLocal,
}: {
  identity: string
  name: string
  speaking: boolean
  muted: boolean
  isLocal?: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`relative rounded-full transition-all duration-150
        ${speaking
          ? 'ring-2 ring-online ring-offset-4 ring-offset-ink-900'
          : 'ring-2 ring-transparent ring-offset-4 ring-offset-ink-900'}`}>
        <Avatar username={identity} displayName={name} size="lg" />
        {/* Иконка выключенного микрофона */}
        {muted && (
          <span className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full
                           border-2 border-ink-900 bg-dnd text-[8px]">
            🔇
          </span>
        )}
        {/* Метка «Вы» */}
        {isLocal && (
          <span className="absolute -left-0.5 -top-0.5 size-4 rounded-full
                           border-2 border-ink-900 bg-grad" />
        )}
      </div>
      <span className="max-w-full truncate text-center text-xs text-fog-200">{name}</span>
    </div>
  )
}

// ── Вспомогательная кнопка управления ──────────────────────────────────────

function ControlBtn({
  children, active, activeClass, onClick,
}: {
  children: ReactNode
  active: boolean
  activeClass: string
  onClick(): void
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3.5 py-2 text-[13px] font-medium transition-all active:scale-95
        ${active ? activeClass : 'bg-ink-700 text-fog-100 hover:bg-ink-600'}`}
    >
      {children}
    </button>
  )
}
