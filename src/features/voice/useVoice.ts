// src/features/voice/useVoice.ts
import { useState, useEffect, useRef, useCallback, useReducer } from 'react'
import {
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  createLocalScreenTracks,
  type RemoteTrack,
  type RemoteTrackPublication,
  type LocalVideoTrack,
  type LocalParticipant,
  type RemoteParticipant,
} from 'livekit-client'
import { LIVEKIT_URL } from './livekit'

export interface UseVoiceResult {
  connected: boolean
  connecting: boolean
  error: string | null
  localParticipant: LocalParticipant | null
  remoteParticipants: RemoteParticipant[]
  isMuted: boolean
  isSharingScreen: boolean
  /** Трек шаринга экрана — пробрасывается в ScreenSharePreview */
  screenTrack: LocalVideoTrack | null
  toggleMute(): void
  toggleScreenShare(): Promise<void>
  disconnect(): void
}

const SCREEN_MAX_BITRATE = 6_000_000  // 6 Mbps
const SCREEN_MAX_FPS = 30

export function useVoice(roomName: string, token: string): UseVoiceResult {
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [localParticipant, setLocalParticipant] = useState<LocalParticipant | null>(null)
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([])
  const [isMuted, setIsMuted] = useState(false)
  const [isSharingScreen, setIsSharingScreen] = useState(false)
  const [screenTrack, setScreenTrack] = useState<LocalVideoTrack | null>(null)

  // LiveKit-участники — мутабельные объекты React не отслеживает.
  // Счётчик форсирует перерисовку при смене активного спикера.
  const [, bump] = useReducer((n: number) => n + 1, 0)
  const roomRef = useRef<Room | null>(null)
  const connectedRef = useRef(false)
  // Входящие аудиотреки: LiveKit не выводит звук сам, трек нужно
  // прикрепить к DOM-элементу <audio>. Ключ — trackSid.
  const audioElsRef = useRef(new Map<string, { el: HTMLAudioElement; identity: string }>())

  useEffect(() => {
    let cancelled = false

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      // Opus 48 кГц — дефолт LiveKit, здесь только параметры захвата
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
    roomRef.current = room

    // На этой сети сервер отвечает на publisher-renegotiation за ~15с.
    // LiveKit Engine сбрасывает peerConnectionTimeout к дефолту (15с) при каждом
    // пересоздании движка (reconnect), поэтому патчим его после каждого Connected.
    const patchEngineTimeout = () => {
      // RTCEngine delegates negotiate() to PCTransportManager which owns its own
      // peerConnectionTimeout. Must patch both — patching only the engine has no effect
      // on mic-publish renegotiation when TURN relay takes >15 s.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eng = (room as any).engine as any
      if (!eng) return
      eng.peerConnectionTimeout = 60_000
      if (eng.pcManager) eng.pcManager.peerConnectionTimeout = 60_000
    }

    const syncPeers = () => {
      if (cancelled) return
      setRemoteParticipants(Array.from(room.remoteParticipants.values()))
    }

    // Участник-владелец трека: RemoteTrackPublication не отдаёт ссылку
    // на участника, поэтому ищем по trackSid в списке удалённых.
    const findOwnerIdentity = (r: Room, trackSid: string): string => {
      for (const p of r.remoteParticipants.values()) {
        for (const pub of p.trackPublications.values()) {
          if (pub.trackSid === trackSid) return p.identity
        }
      }
      return ''
    }

    // Аудиотрек собеседника нужно вручную прикрепить к <audio> —
    // без этого звука нет вообще, хотя микрофон опубликован.
    const attachRemoteAudio = (track: RemoteTrack, pub: RemoteTrackPublication) => {
      if (cancelled) return
      if (track.kind !== Track.Kind.Audio || pub.source === Track.Source.ScreenShareAudio) return
      const sid = pub.trackSid
      if (audioElsRef.current.has(sid)) return
      const el = document.createElement('audio')
      el.autoplay = true
      el.setAttribute('playsinline', 'true')
      el.dataset.participant = track.sid ?? sid
      track.attach(el)
      document.body.appendChild(el)
      audioElsRef.current.set(sid, {
        el,
        identity: findOwnerIdentity(room, sid),
      })
      // Автовоспроизведение может быть заблокировано до первого клика —
      // пробуем ещё раз, когда пользователь что-то нажмёт.
      const resume = () => { void el.play().catch(() => {}) }
      el.play().catch(() => { document.addEventListener('click', resume, { once: true }) })
    }

    const detachRemoteAudio = (_track: RemoteTrack, pub: RemoteTrackPublication) => {
      const entry = audioElsRef.current.get(pub.trackSid)
      if (!entry) return
      entry.el.pause()
      entry.el.srcObject = null
      entry.el.remove()
      audioElsRef.current.delete(pub.trackSid)
    }

    room.on(RoomEvent.Connected, () => {
      if (cancelled) return
      clearTimeout(connectGuard)
      connectedRef.current = true
      patchEngineTimeout()
      setConnected(true)
      setConnecting(false)
      setLocalParticipant(room.localParticipant)
      syncPeers()
      // Включаем микрофон после того как PeerConnection перешёл в connected
      // (conn=connected означает завершение DTLS; попытка publish до этого
      //  приводит к тому что сервер молчит в ответ на offer с треком)
      const pc =
        (room.engine?.pcManager?.publisher as { pc?: RTCPeerConnection } | undefined)?.pc
      const enableMic = async (attempt = 0) => {
        if (cancelled) return
        try {
          await room.localParticipant.setMicrophoneEnabled(true)
        } catch (e: unknown) {
          if (cancelled) return
          const msg = e instanceof Error ? e.message : String(e)
          if (attempt < 3 && /timed out|timeout|negotiation/i.test(msg)) {
            await new Promise<void>((r) => setTimeout(r, 3000))
            return enableMic(attempt + 1)
          }
          setError(`Микрофон недоступен: ${msg}`)
          setIsMuted(true)
        }
      }
      if (!pc || pc.connectionState === 'connected') {
        void enableMic()
      } else {
        const handler = () => {
          if (pc.connectionState === 'connected' || pc.connectionState === 'failed') {
            pc.removeEventListener('connectionstatechange', handler)
            void enableMic()
          }
        }
        pc.addEventListener('connectionstatechange', handler)
        // Подстраховка на случай если событие уже было до нашей подписки
        setTimeout(() => {
          pc.removeEventListener('connectionstatechange', handler)
          void enableMic()
        }, 2000)
      }
    })

    room.on(RoomEvent.Reconnected, () => {
      if (cancelled) return
      patchEngineTimeout()
    })

    room.on(RoomEvent.Disconnected, () => {
      if (cancelled) return
      connectedRef.current = false
      setConnected(false)
      setLocalParticipant(null)
      setRemoteParticipants([])
      setIsSharingScreen(false)
      setScreenTrack(null)
    })

    room.on(RoomEvent.ParticipantConnected, syncPeers)
    room.on(RoomEvent.ParticipantDisconnected, syncPeers)
    room.on(RoomEvent.ActiveSpeakersChanged, bump)
    room.on(RoomEvent.TrackSubscribed, (track, pub) => {
      attachRemoteAudio(track, pub)
      bump()
    })
    room.on(RoomEvent.TrackUnsubscribed, (track, pub) => {
      detachRemoteAudio(track, pub)
      bump()
    })
    room.on(RoomEvent.LocalTrackPublished, bump)
    room.on(RoomEvent.LocalTrackUnpublished, bump)

    // Участник вышел — снимаем его <audio>, иначе элементы копятся
    room.on(RoomEvent.ParticipantDisconnected, (p) => {
      for (const [sid, entry] of audioElsRef.current) {
        if (entry.identity === p.identity) {
          entry.el.pause(); entry.el.srcObject = null; entry.el.remove()
          audioElsRef.current.delete(sid)
        }
      }
    })

    // Если соединение не поднялось за 25 с — показываем ошибку вместо
    // бесконечного «Подключение…». Объявлен до connect(): обработчик
    // Connected выше ссылается на него.
    const connectGuard = setTimeout(() => {
      if (cancelled || connectedRef.current) return
      setError('Не удалось подключиться к голосовому серверу')
      setConnecting(false)
    }, 25_000)

    room.connect(LIVEKIT_URL, token, {
      // Не форсируем relay: при `iceTransportPolicy: 'relay'` соединение
      // устанавливается, только если сервер отдал рабочий TURN-кандидат.
      // На сетях без TURN это даёт полный отказ, поэтому позволяем ICE
      // самому выбрать прямой путь или TURN, если он есть.
      // iceCandidatePoolSize собирает кандидатов заранее, чтобы публикация
      // микрофона не ждала новой аллокации.
      rtcConfig: {
        iceCandidatePoolSize: 2,
      },
      peerConnectionTimeout: 60_000,
    }).catch((e: unknown) => {
      if (cancelled) return
      clearTimeout(connectGuard)
      setError(e instanceof Error ? e.message : String(e))
      setConnecting(false)
    })

    return () => {
      cancelled = true
      room.removeAllListeners()
      void room.disconnect()
      roomRef.current = null
      for (const { el } of audioElsRef.current.values()) {
        el.pause(); el.srcObject = null; el.remove()
      }
      audioElsRef.current.clear()
    }
  }, [roomName, token])

  const toggleMute = useCallback(() => {
    const room = roomRef.current
    if (!room?.localParticipant) return
    const next = !isMuted
    setIsMuted(next)
    room.localParticipant.setMicrophoneEnabled(!next).catch((e: unknown) => {
      setIsMuted(!next) // откат при ошибке
      setError(e instanceof Error ? e.message : String(e))
    })
  }, [isMuted])

  const toggleScreenShare = useCallback(async () => {
    const room = roomRef.current
    if (!room?.localParticipant) return

    if (isSharingScreen) {
      // Останавливаем шаринг
      const pub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare)
      if (pub?.track) {
        await room.localParticipant.unpublishTrack(pub.track)
        pub.track.stop()
      }
      setScreenTrack(null)
      setIsSharingScreen(false)
      return
    }

    try {
      // 1080p, H.264, до 6 Mbps / 30 FPS
      // createLocalScreenTracks возвращает массив [videoTrack, audioTrack?]
      const tracks = await createLocalScreenTracks({
        video: true,
        audio: false,
        resolution: VideoPresets.h1080.resolution,
        contentHint: 'detail',
      })

      const videoTrack = tracks.find((t) => t.kind === Track.Kind.Video) as LocalVideoTrack | undefined
      if (!videoTrack) throw new Error('Не удалось захватить видеотрек экрана')

      // Задаём приоритет кодирования
      await room.localParticipant.publishTrack(videoTrack, {
        source: Track.Source.ScreenShare,
        videoEncoding: {
          maxBitrate: SCREEN_MAX_BITRATE,
          maxFramerate: SCREEN_MAX_FPS,
        },
      })

      setScreenTrack(videoTrack)
      setIsSharingScreen(true)

      // Пользователь нажал «Остановить» в системном диалоге браузера
      videoTrack.mediaStreamTrack.addEventListener('ended', () => {
        setScreenTrack(null)
        setIsSharingScreen(false)
      })
    } catch (e: unknown) {
      // Пользователь отменил выбор окна — не считаем ошибкой
      if (e instanceof Error && e.name === 'NotAllowedError') return
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [isSharingScreen])

  const disconnect = useCallback(() => {
    void roomRef.current?.disconnect()
  }, [])

  return {
    connected, connecting, error,
    localParticipant, remoteParticipants,
    isMuted, isSharingScreen, screenTrack,
    toggleMute, toggleScreenShare, disconnect,
  }
}
