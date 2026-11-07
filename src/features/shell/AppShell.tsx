// src/features/shell/AppShell.tsx
import { useState, useCallback, useEffect } from 'react'
import type { Profile, Channel } from '@/lib/db-types'
import { useServersTree } from '@/features/groups/useServersTree'
import { useMembers } from '@/features/groups/useMembers'
import { createServer, createChannel, joinServerByCode } from '@/features/groups/groupsService'
import { Avatar } from '@/features/ui/Avatar'
import { Modal } from '@/features/ui/Modal'
import { VirtualList } from '@/features/ui/VirtualList'
import { VoiceRoom } from '@/features/voice/VoiceRoom'
import { joinVoiceChannel, leaveVoiceChannel } from '@/features/voice/voiceChannels'
import { ChatView } from '@/features/chat/ChatView'
import { FriendsPanel } from '@/features/friends/FriendsPanel'
import { DmView } from '@/features/dm/DmView'
import { useDmChannels } from '@/features/dm/useDmChannels'
import { IncomingCallModal } from '@/features/calls/IncomingCallModal'
import { CallView } from '@/features/calls/CallView'
import { useIncomingCall } from '@/features/calls/useIncomingCall'
import { initiateCall, endCall } from '@/features/calls/callsService'
import { supabase } from '@/lib/supabase'

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
      <aside className="flex w-[68px] flex-col items-center gap-1.5 overflow-y-auto bg-ink-900 py-3 scrollbar-thin">
        {/* Кнопка «Друзья / DM» */}
        <button
          onClick={() => { setSelectedServerId(null); setView({ kind: 'friends' }) }}
          title="Друзья и личные сообщения"
          className={`relative flex size-12 flex-col items-center justify-center gap-0.5 rounded-[50%] text-lg transition-all duration-200
            ${social
              ? 'rounded-[30%] bg-accent text-white shadow-lg shadow-accent/30'
              : 'bg-ink-700 text-fog-300 hover:rounded-[30%] hover:bg-accent hover:text-white'}`}
        >
          👥
          {/* Бейдж входящего звонка */}
          {incomingCall && (
            <span className="absolute right-0 top-0 size-3 animate-pulse rounded-full border-2 border-ink-900 bg-dnd" />
          )}
        </button>

        <div className="my-1 h-px w-8 bg-white/8" />

        {/* Серверы */}
        {serversLoading ? (
          <div className="mt-2 size-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        ) : (
          servers.map(({ server }) => (
            <button
              key={server.id}
              onClick={() => selectServer(server.id)}
              title={server.name}
              className={`relative size-12 rounded-[50%] text-xs font-bold transition-all duration-200
                ${selectedServerId === server.id && !social
                  ? 'rounded-[30%] bg-accent text-white shadow-lg shadow-accent/30'
                  : 'bg-ink-700 text-fog-200 hover:rounded-[30%] hover:bg-accent hover:text-white'}`}
            >
              {server.name.slice(0, 2).toUpperCase()}
              {selectedServerId === server.id && !social && (
                <span className="absolute -left-1 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r bg-white" />
              )}
            </button>
          ))
        )}

        <div className="mt-auto flex flex-col gap-1.5 pb-2">
          <button
            onClick={() => { setShowNewServer(true); setModalErr(null) }}
            title="Создать сервер"
            className="size-12 rounded-full bg-ink-700 text-xl font-light text-online transition-all hover:rounded-[30%] hover:bg-online hover:text-white"
          >+</button>
          <button
            onClick={() => { setShowJoin(true); setModalErr(null) }}
            title="Вступить по коду"
            className="size-12 rounded-full bg-ink-700 text-base text-fog-400 transition-all hover:rounded-[30%] hover:bg-ink-600"
          >🔗</button>
        </div>
      </aside>

      {/* ── Сайдбар: каналы сервера ── */}
      {selectedServer && !social && (
        <aside className="flex w-56 flex-col border-r border-white/5 bg-ink-800">
          <header className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <span className="truncate text-sm font-semibold text-fog-100">{selectedServer.server.name}</span>
            <button
              onClick={() => { setShowNewChannel(true); setModalErr(null) }}
              title="Новый канал"
              className="text-lg leading-none text-fog-400 hover:text-fog-100"
            >+</button>
          </header>

          <div className="flex-1 overflow-y-auto py-2 scrollbar-thin">
            {channels.length === 0 && (
              <p className="px-4 py-2 text-xs text-fog-400">Каналов нет</p>
            )}
            {channels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => void handleChannelClick(ch)}
                className={`mx-1 flex w-[calc(100%-0.5rem)] items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors
                  ${activeChannelId === ch.id
                    ? 'bg-ink-700 text-fog-100'
                    : 'text-fog-400 hover:bg-ink-700/50 hover:text-fog-200'}`}
              >
                <span className="text-fog-400">{ch.type === 'VOICE' ? '🔊' : '#'}</span>
                <span className="truncate">{ch.name}</span>
              </button>
            ))}
          </div>

          <ProfileBar profile={profile} onSignOut={onSignOut} />
        </aside>
      )}

      {/* ── Сайдбар: переписки и друзья ── */}
      {social && (
        <aside className="flex w-56 flex-col border-r border-white/5 bg-ink-800">
          <header className="border-b border-white/5 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-fog-400">Личные сообщения</p>
          </header>

          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {conversations.length === 0 && (
              <p className="p-4 text-xs text-fog-400">Нет переписок</p>
            )}
            {conversations.map((conv) => {
              const isActive = view.kind === 'dm' && view.dmChannelId === conv.dm.id
              return (
                <button
                  key={conv.dm.id}
                  onClick={() => setView({ kind: 'dm', dmChannelId: conv.dm.id, friendProfile: conv.peer as Profile })}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 transition-colors
                    ${isActive ? 'bg-ink-700' : 'hover:bg-ink-700/50'}`}
                >
                  <Avatar
                    username={conv.peer.username}
                    displayName={conv.peer.display_name}
                    avatarUrl={conv.peer.avatar_url}
                    status={conv.peer.status}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-xs font-medium text-fog-100">
                      {conv.peer.display_name || conv.peer.username}
                    </p>
                    {conv.lastMessage && (
                      <p className="truncate text-[10px] text-fog-400">{conv.lastMessage}</p>
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
          <VoiceRoom
            roomName={view.room}
            participantName={profile.display_name || profile.username}
            onLeave={async () => {
              await leaveVoiceChannel(view.channel.id, profile.id).catch(() => null)
              setView({ kind: 'empty' })
            }}
          />
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
          <CallView
            callId={view.callId}
            room={view.room}
            profile={profile}
            partner={view.partner}
            role={view.role}
            onEnd={() => void handleEndCall(view.callId)}
          />
        )}

        {/* Пустое состояние */}
        {view.kind === 'empty' && (
          <div className="grid flex-1 place-items-center text-sm text-fog-400">
            {selectedServer ? 'Выберите канал' : 'Выберите сервер или откройте 👥 Друзья'}
          </div>
        )}

        {/* Панель участников сервера — только для текстовых каналов */}
        {selectedServerId && view.kind === 'server' && (
          <aside className="flex w-52 flex-shrink-0 flex-col border-l border-white/5 bg-ink-800">
            <h3 className="border-b border-white/5 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-fog-400">
              Участники {membersLoading ? '…' : `(${members.length}${hasMore ? '+' : ''})`}
            </h3>
            <VirtualList
              items={members}
              itemHeight={44}
              height={600}
              onEndReached={loadMore}
              className="flex-1"
              renderItem={(m) => (
                <div className="flex items-center gap-2 px-3 py-2">
                  <Avatar
                    username={m.username}
                    displayName={m.display_name}
                    avatarUrl={m.avatar_url}
                    status={m.status}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-xs text-fog-200">{m.display_name || m.username}</p>
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
        <div
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-dnd px-4 py-2.5
                     text-sm text-white shadow-xl cursor-pointer"
          onClick={() => setCallError(null)}
        >
          {callError}
        </div>
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

// ── Строка профиля внизу сайдбара ───────────────────────────
function ProfileBar({ profile, onSignOut }: { profile: Profile; onSignOut(): void }) {
  return (
    <div className="flex items-center gap-2 border-t border-white/5 bg-ink-800/80 px-3 py-3">
      <Avatar
        username={profile.username}
        displayName={profile.display_name}
        avatarUrl={profile.avatar_url}
        status={profile.status}
        size="sm"
      />
      <span className="min-w-0 flex-1 truncate text-xs text-fog-200">
        {profile.display_name || profile.username}
      </span>
      <button onClick={onSignOut} title="Выйти"
        className="text-sm text-fog-400 transition-colors hover:text-danger">⬡</button>
    </div>
  )
}
