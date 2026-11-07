// src/features/calls/IncomingCallModal.tsx
import { useEffect, useRef } from 'react'
import { Avatar } from '@/features/ui/Avatar'
import type { Profile } from '@/lib/db-types'

interface IncomingCallModalProps {
  callerProfile: Profile | null
  onAccept(): void
  onDecline(): void
}

/** Простой двухтональный рингтон через Web Audio — без внешних файлов */
function useRingtone(active: boolean) {
  const ctxRef = useRef<AudioContext | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!active) return

    // Один контекст на весь вызов — браузеры ограничивают их количество
    const AudioCtx = window.AudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    ctxRef.current = ctx
    if (ctx.state === 'suspended') void ctx.resume()

    // 440 Гц + 480 Гц, короткие гудки каждые 1.5 с
    const play = () => {
      if (ctx.state === 'closed') return
      const t0 = ctx.currentTime
      for (const freq of [440, 480]) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        osc.connect(gain)
        gain.connect(ctx.destination)
        gain.gain.setValueAtTime(0.0001, t0)
        gain.gain.exponentialRampToValueAtTime(0.08, t0 + 0.05)
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6)
        osc.start(t0)
        osc.stop(t0 + 0.62)
      }
    }

    play()
    intervalRef.current = setInterval(play, 1500)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = null
      if (ctx.state !== 'closed') void ctx.close()
      ctxRef.current = null
    }
  }, [active])
}

export function IncomingCallModal({ callerProfile, onAccept, onDecline }: IncomingCallModalProps) {
  const isOpen = !!callerProfile
  useRingtone(isOpen)

  if (!isOpen || !callerProfile) return null

  const name = callerProfile.display_name || callerProfile.username

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xs space-y-5 rounded-2xl bg-ink-800 p-6 text-center shadow-2xl ring-1 ring-white/10">
        <p className="text-xs uppercase tracking-widest text-fog-400">Входящий звонок</p>

        <div className="flex flex-col items-center gap-3">
          {/* Пульсирующий аватар */}
          <div className="relative grid place-items-center">
            <span className="absolute size-16 animate-ping rounded-full bg-online/30" />
            <Avatar
              username={callerProfile.username}
              displayName={callerProfile.display_name}
              avatarUrl={callerProfile.avatar_url}
              size="lg"
            />
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-fog-100">{name}</p>
            <p className="truncate text-xs text-fog-400">@{callerProfile.username}</p>
          </div>
        </div>

        <div className="flex justify-center gap-3">
          <button
            onClick={onDecline}
            className="grid size-14 place-items-center rounded-full bg-dnd text-2xl text-white shadow-lg transition-all hover:bg-dnd/80 active:scale-90"
            title="Отклонить"
          >
            📵
          </button>
          <button
            onClick={onAccept}
            className="grid size-14 place-items-center rounded-full bg-online text-2xl text-white shadow-lg transition-all hover:bg-online/80 active:scale-90"
            title="Принять"
          >
            📞
          </button>
        </div>
      </div>
    </div>
  )
}
