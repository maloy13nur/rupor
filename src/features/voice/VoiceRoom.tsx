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
        <div className="size-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <p className="text-sm text-fog-400">Подключение к каналу…</p>
        <button onClick={onLeave} className="btn-secondary text-xs">Отмена</button>
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

function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-ink-900">
      {children}
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
        <div className="size-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <p className="text-sm text-fog-400">Соединение…</p>
        <button onClick={handleLeave} className="btn-secondary text-xs">Отмена</button>
      </Overlay>
    )
  }

  return (
    <div className="relative flex flex-1 flex-col bg-ink-900 overflow-hidden">
      {/* Заголовок */}
      <header className="flex items-center justify-between border-b border-white/5 bg-ink-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-online text-sm">🔊</span>
          <span className="font-semibold text-fog-100 text-sm">
            {callMode && callPartnerName ? `Звонок с ${callPartnerName}` : 'Голосовой канал'}
          </span>
        </div>
        <span className="text-xs text-fog-400">
          {v.remoteParticipants.length + 1} участн.
        </span>
      </header>

      {/* Ошибка */}
      {v.error && (
        <div className="mx-4 mt-3 rounded-lg bg-dnd/15 px-3 py-2 text-xs text-dnd">
          {v.error}
        </div>
      )}

      {/* Сетка участников */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5">
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
        <div className="absolute bottom-20 right-4 z-10 drop-shadow-2xl">
          <ScreenSharePreview track={v.screenTrack} />
        </div>
      )}

      {/* Панель управления */}
      <footer className="flex items-center justify-center gap-3 border-t border-white/5 bg-ink-800 px-4 py-4">
        <ControlBtn
          active={v.isMuted}
          activeClass="bg-dnd text-white"
          onClick={v.toggleMute}
        >
          {v.isMuted ? '🔇 Включить' : '🎙 Выкл. микр.'}
        </ControlBtn>

        <ControlBtn
          active={v.isSharingScreen}
          activeClass="bg-accent text-white"
          onClick={() => void v.toggleScreenShare()}
        >
          {v.isSharingScreen ? '🖥 Остановить' : '🖥 Шаринг'}
        </ControlBtn>

        <button onClick={handleLeave} className="btn-danger text-sm px-3 py-2">
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
    <div className="flex flex-col items-center gap-1.5">
      <div className={`relative rounded-full transition-all duration-150
        ${speaking
          ? 'ring-2 ring-online ring-offset-2 ring-offset-ink-900'
          : 'ring-2 ring-transparent'}`}>
        <Avatar username={identity} displayName={name} size="lg" />
        {/* Иконка выключенного микрофона */}
        {muted && (
          <span className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full
                           border-2 border-ink-900 bg-dnd grid place-items-center text-[8px]">
            🔇
          </span>
        )}
        {/* Метка «Вы» */}
        {isLocal && (
          <span className="absolute -top-0.5 -left-0.5 size-4 rounded-full
                           border-2 border-ink-900 bg-accent" />
        )}
      </div>
      <span className="max-w-full truncate text-xs text-fog-200 text-center">{name}</span>
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
      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors
        ${active ? activeClass : 'bg-ink-700 text-fog-100 hover:bg-ink-600'}`}
    >
      {children}
    </button>
  )
}
