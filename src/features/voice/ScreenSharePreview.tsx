// src/features/voice/ScreenSharePreview.tsx
import { useEffect, useRef } from 'react'
import type { LocalVideoTrack } from 'livekit-client'

interface ScreenSharePreviewProps {
  /** Видеотрек шаринга. Если null — компонент скрыт. */
  track: LocalVideoTrack | null
}

/**
 * Мини-превью своего шаринга экрана (240×135 пикселей).
 * Используется как плавающее окно в углу VoiceRoom.
 */
export function ScreenSharePreview({ track }: ScreenSharePreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = videoRef.current
    if (!track || !el) return
    track.attach(el)
    return () => { track.detach(el) }
  }, [track])

  if (!track) return null

  return (
    <div className="w-[240px] h-[135px] overflow-hidden rounded-lg
                    border border-ink-700 bg-ink-900 shadow-2xl ring-1 ring-white/10">
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        className="h-full w-full object-contain"
      />
    </div>
  )
}
