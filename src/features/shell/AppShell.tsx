// src/features/shell/AppShell.tsx
import { useState, useCallback, useEffect, lazy, Suspense } from 'react'
import type { Profile, Channel } from '@/lib/db-types'
import { useServersTree } from '@/features/groups/useServersTree'
import { useMembers } from '@/features/groups/useMembers'
import { createServer, createChannel, joinServerByCode } from '@/features/groups/groupsService'
import { Avatar } from '@/features/ui/Avatar'
import { Modal } from '@/features/ui/Modal'
import { VirtualList } from '@/features/ui/VirtualList'
import { joinVoiceChannel, leaveVoiceChannel } from '@/features/voice/voiceChannels'
import { ChatView } from '@/features/chat/ChatView'
import { FriendsPanel } from '@/features/friends/FriendsPanel'
import { DmView } from '@/features/dm/DmView'
import { useDmChannels } from '@/features/dm/useDmChannels'
import { IncomingCallModal } from '@/features/calls/IncomingCallModal'
import { useIncomingCall } from '@/features/calls/useIncomingCall'
import { initiateCall, endCall } from '@/features/calls/callsService'
import { supabase } from '@/lib/supabase'

// Голос и звонки тянут весь livekit-client (~800 КБ). Грузим их только
// когда пользователь реально заходит в канал или принимает звонок —
// иначе бандл парсится на старте и приложение открывается заметно дольше.
const VoiceRoom = lazy(() =>
  import('@/features/voice/VoiceRoom').then((m) => ({ default: m.VoiceRoom })),
)
const CallView = lazy(() =>
  import('@/features/calls/CallView').then((m) => ({ default: m.CallView })),
)

// ── Тип главного вида ───────────────────────────────────────
type MainView =
  | { kind: 'server'; channel: Channel }
  | { kind: 'voice-channel'; channel: Channel; room: string }
  | { kind: 'friends' }
  | { kind: 'dm'; dmChannelId: string; friendProfile: Profile }
  | { kind: 'call'; room: string; partner: Profile; callId: string; role: 'caller' | 'callee' }
  | { kind: 'empty' }

// Является ли вид «социальным» (друзья / личка / звонок)
const isSocial = (v: MainView) =>
  v.kind === 'friends' || v.kind === 'dm' || v.kind === 'call'

interface AppShellProps {
  profile: Profile
  onSignOut(): void
}

export function AppShell({ profile, onSignOut }: AppShellProps) {
  const { servers, loading: serversLoading } = useServersTree()
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)
  const [view, setView] = useState<MainView>({ kind: 'empty' })

  // DM-переписки для сайдбара
  const { conversations, refresh: refreshDms } = useDmChannels(profile.id)

  // Модальные окна
  const [showNewServer, setShowNewServer] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [showNewChannel, setShowNewChannel] = useState(false)
  const [serverNameInput, setServerNameInput] = useState('')
  const [joinCodeInput, setJoinCodeInput] = useState('')
  const [channelNameInput, setChannelNameInput] = useState('')
  const [channelTypeInput, setChannelTypeInput] = useState<'TEXT' | 'VOICE'>('TEXT')
  const [modalErr, setModalErr] = useState<string | null>(null)

  // Профиль звонящего (для IncomingCallModal)
  const [callerProfile, setCallerProfile] = useState<Profile | null>(null)

  const selectedServer = servers.find((s) => s.server.id === selectedServerId)
  const channels = selectedServer?.channels ?? []
  const { members, loading: membersLoading, loadingMore, hasMore, loadMore } = useMembers(selectedServerId)

  // ── Входящие звонки ─────────────────────────────────────────
  const { incomingCall, accept: acceptIncoming, decline: declineIncoming } = useIncomingCall(profile.id)

  useEffect(() => {
    if (!incomingCall) { setCallerProfile(null); return }
    supabase
      .from('profiles').select('*').eq('id', incomingCall.caller_id).maybeSingle()
      .then(({ data }) => setCallerProfile(data as Profile | null))
  }, [incomingCall])

  const handleAcceptIncoming = useCallback(async () => {
    if (!incomingCall || !callerProfile) return
    const savedPartner = callerProfile
    const savedCallId = incomingCall.id
    setCallerProfile(null)
    const room = await acceptIncoming()
    if (room) {
      setSelectedServerId(null)
      setView({ kind: 'call', room, partner: savedPartner, callId: savedCallId, role: 'callee' })
    } else {
      setCallError('Не удалось принять звонок — попробуйте снова')
    }
  }, [incomingCall, callerProfile, acceptIncoming])

  const handleDeclineIncoming = useCallback(async () => {
    await declineIncoming()
    setCallerProfile(null)
  }, [declineIncoming])

  // ── Исходящий звонок ────────────────────────────────────────
  const [callError, setCallError] = useState<string | null>(null)

  const handleCall = useCallback(async (friendId: string, friendProfile: Profile) => {
    setCallError(null)
    try {
      const { callId, room } = await initiateCall(friendId)
      setSelectedServerId(null)
      setView({ kind: 'call', room, partner: friendProfile, callId, role: 'caller' })
    } catch (e) {
      setCallError(e instanceof Error ? e.message : 'Не удалось позвонить')
    }
  }, [])

  const handleEndCall = useCallback(async (callId: string) => {
    await endCall(callId, 'ended').catch(() => null)
    setView({ kind: 'friends' })
  }, [])

  // ── Серверные каналы ────────────────────────────────────────
  const selectServer = useCallback((id: string) => {
    setSelectedServerId(id)
    setView({ kind: 'empty' })
  }, [])

  const leaveCurrentVoice = useCallback(async () => {
    if (view.kind === 'voice-channel') {
      await leaveVoiceChannel(view.channel.id, profile.id).catch(() => null)
    }
  }, [view, profile.id])

  const handleChannelClick = useCallback(async (ch: Channel) => {
    await leaveCurrentVoice()
    if (ch.type === 'TEXT') {
      setView({ kind: 'server', channel: ch })
    } else {
      try {
        const room = await joinVoiceChannel(ch.id, profile.id)
        setView({ kind: 'voice-channel', channel: ch, room })
      } catch (e) {
        console.error('Не удалось войти в голосовой канал:', e)
      }
    }
  }, [leaveCurrentVoice, profile.id])

  // ── Модалки: серверы и каналы ───────────────────────────────
  async function handleCreateServer() {
    if (!serverNameInput.trim()) return
    setModalErr(null)
    try {
      await createServer(serverNameInput.trim())
      setShowNewServer(false)
      setServerNameInput('')
    } catch (e) { setModalErr(e instanceof Error ? e.message : String(e)) }
  }

  async function handleJoin() {
    if (!joinCodeInput.trim()) return
    setModalErr(null)
    try {
      await joinServerByCode(joinCodeInput.trim())
      setShowJoin(false)
      setJoinCodeInput('')
    } catch (e) { setModalErr(e instanceof Error ? e.message : String(e)) }
  }

  async function handleCreateChannel() {
    if (!selectedServerId || !channelNameInput.trim()) return
    setModalErr(null)
    try {
      await createChannel(selectedServerId, channelNameInput.trim(), channelTypeInput)
      setShowNewChannel(false)
      setChannelNameInput('')
    } catch (e) { setModalErr(e instanceof Error ? e.message : String(e)) }
  }

  const activeChannelId =
    view.kind === 'server' ? view.channel.id :
    view.kind === 'voice-channel' ? view.channel.id : null

  const social = isSocial(view)

  return (
    <div className="flex h-screen overflow-hidden bg-ink-900">

      {/* ── Server Rail ── */}
      <aside className="flex w-[68px] flex-col items-center gap-2 overflow-y-auto border-r border-white/7 bg-ink-800 py-3.5 scrollbar-thin">
        {/* Кнопка «Друзья / DM» */}
        <button
          onClick={() => { setSelectedServerId(null); setView({ kind: 'friends' }) }}
          title="Друзья и личные сообщения"
          className={`relative grid size-11 place-items-center rounded-[15px] text-base transition-all duration-200
            ${social
              ? 'bg-grad text-white shadow-[0_8px_22px_-10px_rgb(var(--grad-a))] !rounded-[13px]'
              : 'bg-ink-600 text-fog-300 hover:!rounded-[13px] hover:bg-accent/20 hover:text-fog-100'}`}
        >
          👥
          {social && (
            <span className="absolute -left-3 top-1/2 h-[22px] w-1 -translate-y-1/2 rounded-r bg-fog-100" />
          )}
          {/* Бейдж входящего звонка */}
          {incomingCall && (
            <span className="absolute right-0 top-0 size-3 animate-pulse rounded-full border-2 border-ink-800 bg-dnd" />
          )}
        </button>

        <div className="my-0.5 h-px w-6 bg-white/13" />

        {/* Серверы */}
        {serversLoading ? (
          <div className="mt-2 size-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        ) : (
          servers.map(({ server }) => {
            const active = selectedServerId === server.id && !social
            return (
              <button
                key={server.id}
                onClick={() => selectServer(server.id)}
                title={server.name}
                className={`relative grid size-11 place-items-center rounded-[15px] text-xs font-bold transition-all duration-200
                  ${active
                    ? 'bg-grad text-white shadow-[0_8px_22px_-10px_rgb(var(--grad-a))] !rounded-[13px]'
                    : 'bg-ink-600 text-fog-200 hover:!rounded-[13px] hover:bg-accent/20 hover:text-fog-100'}`}
              >
                {server.name.slice(0, 2).toUpperCase()}
                {active && (
                  <span className="absolute -left-3 top-1/2 h-[22px] w-1 -translate-y-1/2 rounded-r bg-fog-100" />
                )}
              </button>
            )
          })
        )}

        <div className="mt-auto flex flex-col gap-2 pb-1">
          <button
            onClick={() => { setShowNewServer(true); setModalErr(null) }}
            title="Создать сервер"
            className="grid size-10 place-items-center rounded-xl bg-ink-600 text-lg font-light text-online transition-all hover:!rounded-[13px] hover:bg-online hover:text-white"
          >+</button>
          <button
            onClick={() => { setShowJoin(true); setModalErr(null) }}
            title="Вступить по коду"
            className="grid size-10 place-items-center rounded-xl bg-ink-600 text-sm text-fog-400 transition-all hover:!rounded-[13px] hover:bg-ink-700 hover:text-fog-200"
          >🔗</button>
        </div>
      </aside>

      {/* ── Сайдбар: каналы сервера ── */}
      {selectedServer && !social && (
        <aside className="flex w-[250px] flex-col border-r border-white/7 bg-ink-700">
          <header className="flex items-center justify-between gap-2 border-b border-white/7 px-4 py-3.5">
            <span className="truncate text-[13.5px] font-semibold text-fog-100">{selectedServer.server.name}</span>
            <button
              onClick={() => { setShowNewChannel(true); setModalErr(null) }}
              title="Новый канал"
              className="grid size-6 place-items-center rounded-md text-fog-400 transition-colors hover:bg-white/6 hover:text-fog-100"
            >＋</button>
          </header>

          <div className="flex-1 overflow-y-auto px-2 py-2.5 scrollbar-thin">
            {channels.length === 0 && (
              <p className="px-2 py-2 text-xs text-fog-400">Каналов нет</p>
            )}

            {channels.some((c) => c.type === 'TEXT') && (
              <GroupLabel>Текстовые</GroupLabel>
            )}
            {channels.filter((c) => c.type === 'TEXT').map((ch) => (
              <ChannelButton
                key={ch.id}
                channel={ch}
                active={activeChannelId === ch.id}
                onClick={() => void handleChannelClick(ch)}
              />
            ))}

            {channels.some((c) => c.type === 'VOICE') && (
              <GroupLabel>Голосовые</GroupLabel>
            )}
            {channels.filter((c) => c.type === 'VOICE').map((ch) => (
              <ChannelButton
                key={ch.id}
                channel={ch}
                active={activeChannelId === ch.id}
                onClick={() => void handleChannelClick(ch)}
              />
            ))}
          </div>

          <ProfileBar profile={profile} onSignOut={onSignOut} />
        </aside>
      )}

      {/* ── Сайдбар: переписки и друзья ── */}
      {social && (
        <aside className="flex w-[250px] flex-col border-r border-white/7 bg-ink-700">
          <header className="border-b border-white/7 px-4 py-3.5">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.11em] text-fog-400">Личные сообщения</p>
          </header>

          <div className="flex-1 overflow-y-auto px-2 py-2.5 scrollbar-thin">
            {conversations.length === 0 && (
              <p className="px-2 py-2 text-xs text-fog-400">Нет переписок</p>
            )}
            {conversations.map((conv) => {
              const isActive = view.kind === 'dm' && view.dmChannelId === conv.dm.id
              return (
                <button
                  key={conv.dm.id}
                  onClick={() => setView({ kind: 'dm', dmChannelId: conv.dm.id, friendProfile: conv.peer as Profile })}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors
                    ${isActive ? 'bg-accent/14' : 'hover:bg-white/[.045]'}`}
                >
                  <Avatar
                    username={conv.peer.username}
                    displayName={conv.peer.display_name}
                    avatarUrl={conv.peer.avatar_url}
                    status={conv.peer.status}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1 text-left">
                    <p className={`truncate text-[12.5px] ${isActive ? 'font-medium text-fog-100' : 'text-fog-200'}`}>
                      {conv.peer.display_name || conv.peer.username}
                    </p>
                    {conv.lastMessage && (
                      <p className="truncate text-[10.5px] text-fog-400">{conv.lastMessage}</p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          <ProfileBar profile={profile} onSignOut={onSignOut} />
        </aside>
      )}

      {/* ── Главная область ── */}
      <main className="flex flex-1 overflow-hidden">

        {/* Голосовой канал сервера */}
        {view.kind === 'voice-channel' && (
          <Suspense fallback={<LazyVoiceFallback label="Подключение к каналу…" />}>
            <VoiceRoom
              roomName={view.room}
              participantName={profile.display_name || profile.username}
              onLeave={async () => {
                await leaveVoiceChannel(view.channel.id, profile.id).catch(() => null)
                setView({ kind: 'empty' })
              }}
            />
          </Suspense>
        )}

        {/* Текстовый канал */}
        {view.kind === 'server' && (
          <ChatView channel={view.channel} profile={profile} />
        )}

        {/* Список друзей */}
        {view.kind === 'friends' && (
          <FriendsPanel
            myId={profile.id}
            onOpenDm={(dmChannelId, friendProfile) => {
              void refreshDms()
              setView({ kind: 'dm', dmChannelId, friendProfile })
            }}
            onCall={(friendId, friendProfile) => void handleCall(friendId, friendProfile)}
          />
        )}

        {/* Личный чат */}
        {view.kind === 'dm' && (
          <DmView
            dmChannelId={view.dmChannelId}
            profile={profile}
            friendProfile={view.friendProfile}
            onCall={() => void handleCall(view.friendProfile.id, view.friendProfile)}
          />
        )}

        {/* Звонок 1-на-1 */}
        {view.kind === 'call' && (
          <Suspense fallback={<LazyVoiceFallback label="Соединение…" />}>
            <CallView
              callId={view.callId}
              room={view.room}
              profile={profile}
              partner={view.partner}
              role={view.role}
              onEnd={() => void handleEndCall(view.callId)}
            />
          </Suspense>
        )}

        {/* Пустое состояние */}
        {view.kind === 'empty' && (
          <div className="grid flex-1 place-items-center text-sm text-fog-400">
            {selectedServer ? 'Выберите канал' : 'Выберите сервер или откройте 👥 Друзья'}
          </div>
        )}

        {/* Панель участников сервера — только для текстовых каналов */}
        {selectedServerId && view.kind === 'server' && (
          <aside className="flex w-[212px] flex-shrink-0 flex-col border-l border-white/7 bg-ink-700">
            <h3 className="px-4 py-3.5 text-[10.5px] font-bold uppercase tracking-[0.11em] text-fog-400">
              Участники {membersLoading ? '…' : `(${members.length}${hasMore ? '+' : ''})`}
            </h3>
            <VirtualList
              items={members}
              itemHeight={44}
              height={600}
              onEndReached={loadMore}
              className="flex-1"
              renderItem={(m) => (
                <div className="flex items-center gap-2.5 px-4 py-1.5 hover:bg-white/[.03]">
                  <Avatar
                    username={m.username}
                    displayName={m.display_name}
                    avatarUrl={m.avatar_url}
                    status={m.status}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] text-fog-200">{m.display_name || m.username}</p>
                    <p className="text-[10px] text-fog-400">{m.role}</p>
                  </div>
                </div>
              )}
            />
            {loadingMore && (
              <p className="py-2 text-center text-xs text-fog-400">Загрузка…</p>
            )}
          </aside>
        )}
      </main>

      {/* ── Входящий звонок (поверх всего) ── */}
      <IncomingCallModal
        callerProfile={callerProfile}
        onAccept={() => void handleAcceptIncoming()}
        onDecline={() => void handleDeclineIncoming()}
      />

      {/* ── Ошибка звонка ── */}
      {callError && (
        <button
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-danger/30 bg-danger px-4 py-2.5
                     text-sm text-white shadow-2xl"
          onClick={() => setCallError(null)}
        >
          {callError}
        </button>
      )}

      {/* ── Модальные окна ── */}
      <Modal open={showNewServer} onClose={() => setShowNewServer(false)} title="Новый сервер">
        <div className="space-y-3">
          {modalErr && <p className="text-xs text-danger">{modalErr}</p>}
          <input className="input" placeholder="Название сервера" value={serverNameInput}
            onChange={(e) => setServerNameInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleCreateServer()} />
          <button onClick={() => void handleCreateServer()} className="btn-primary w-full">Создать</button>
        </div>
      </Modal>

      <Modal open={showJoin} onClose={() => setShowJoin(false)} title="Вступить по коду">
        <div className="space-y-3">
          {modalErr && <p className="text-xs text-danger">{modalErr}</p>}
          <input className="input" placeholder="Код приглашения" value={joinCodeInput}
            onChange={(e) => setJoinCodeInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleJoin()} />
          <button onClick={() => void handleJoin()} className="btn-primary w-full">Вступить</button>
        </div>
      </Modal>

      <Modal open={showNewChannel} onClose={() => setShowNewChannel(false)} title="Новый канал">
        <div className="space-y-3">
          {modalErr && <p className="text-xs text-danger">{modalErr}</p>}
          <input className="input" placeholder="Название канала" value={channelNameInput}
            onChange={(e) => setChannelNameInput(e.target.value)} />
          <div className="flex gap-2">
            <button onClick={() => setChannelTypeInput('TEXT')}
              className={`flex-1 btn-secondary ${channelTypeInput === 'TEXT' ? '!bg-accent !text-white' : ''}`}>
              # Текст
            </button>
            <button onClick={() => setChannelTypeInput('VOICE')}
              className={`flex-1 btn-secondary ${channelTypeInput === 'VOICE' ? '!bg-accent !text-white' : ''}`}>
              🔊 Голос
            </button>
          </div>
          <button onClick={() => void handleCreateChannel()} className="btn-primary w-full">Создать</button>
        </div>
      </Modal>
    </div>
  )
}

// ── Заголовок группы каналов ────────────────────────────────
function LazyVoiceFallback({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-ink-900">
      <div className="size-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      <p className="text-sm text-fog-400">{label}</p>
    </div>
  )
}

function GroupLabel({ children }: { children: React.ReactNode }) {  return (
    <div className="flex items-center gap-1.5 px-2 pb-1.5 pt-3 text-[10.5px] font-bold uppercase tracking-[0.11em] text-fog-400">
      <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" className="opacity-60">
        <path d="M12 5l7 9H5z" />
      </svg>
      {children}
    </div>
  )
}

// ── Кнопка канала ───────────────────────────────────────────
function ChannelButton({ channel, active, onClick }: {
  channel: Channel
  active: boolean
  onClick(): void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13.5px] transition-colors
        ${active
          ? 'bg-accent/14 font-medium text-fog-100'
          : 'text-fog-300 hover:bg-white/[.045] hover:text-fog-100'}`}
    >
      <span className={`w-4 text-center text-xs ${active ? 'text-accent' : 'text-fog-400'}`}>
        {channel.type === 'VOICE' ? '🔊' : '#'}
      </span>
      <span className="truncate">{channel.name}</span>
    </button>
  )
}

// ── Строка профиля внизу сайдбара ───────────────────────────
function ProfileBar({ profile, onSignOut }: { profile: Profile; onSignOut(): void }) {
  return (
    <div className="flex items-center gap-2.5 border-t border-white/7 bg-black/20 px-3 py-2.5">
      <Avatar
        username={profile.username}
        displayName={profile.display_name}
        avatarUrl={profile.avatar_url}
        status={profile.status}
        size="sm"
      />
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fog-200">
        {profile.display_name || profile.username}
      </span>
      <button onClick={onSignOut} title="Выйти"
        className="rounded-md p-1.5 text-sm text-fog-400 transition-colors hover:bg-danger/14 hover:text-red-400">⏻</button>
    </div>
  )
}
