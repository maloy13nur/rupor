// src/features/friends/FriendsPanel.tsx
import { useState, type ReactNode } from 'react'
import { Avatar } from '@/features/ui/Avatar'
import { useFriends } from './useFriends'
import {
  sendFriendRequestByUsername,
  acceptFriendRequest,
  removeFriend,
  openDm,
} from './friendsService'
import type { Profile } from '@/lib/db-types'

interface FriendsPanelProps {
  myId: string
  /** Открыть DM-чат с этим dmChannelId */
  onOpenDm(dmChannelId: string, friendProfile: Profile): void
  /** Позвонить другу */
  onCall(friendId: string, friendProfile: Profile): void
}

export function FriendsPanel({ myId, onOpenDm, onCall }: FriendsPanelProps) {
  const { friends, pending, loading, error, refresh } = useFriends(myId)
  const [addInput, setAddInput] = useState('')
  const [addErr, setAddErr] = useState<string | null>(null)
  const [addBusy, setAddBusy] = useState(false)
  const [tab, setTab] = useState<'friends' | 'pending'>('friends')

  async function handleAdd() {
    if (!addInput.trim() || addBusy) return
    setAddErr(null)
    setAddBusy(true)
    try {
      await sendFriendRequestByUsername(addInput.trim())
      setAddInput('')
      setAddErr(null)
      await refresh()
    } catch (e) {
      setAddErr(e instanceof Error ? e.message : String(e))
    } finally {
      setAddBusy(false)
    }
  }

  async function handleAccept(friendshipId: string) {
    await acceptFriendRequest(friendshipId).catch(() => null)
    await refresh()
  }

  async function handleRemove(friendshipId: string) {
    await removeFriend(friendshipId).catch(() => null)
    await refresh()
  }

  async function handleOpenDm(friendId: string, profile: Profile) {
    try {
      const dmId = await openDm(friendId)
      onOpenDm(dmId, profile)
    } catch (e) {
      console.error('Не удалось открыть DM:', e)
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-ink-900">
      {/* Заголовок */}
      <header className="flex items-center justify-between border-b border-white/5 bg-ink-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-fog-100">Друзья</h2>
        <button
          onClick={() => void refresh()}
          disabled={loading}
          title="Обновить"
          className="text-fog-400 hover:text-fog-100 disabled:opacity-40 transition-colors text-sm"
        >
          ⟳
        </button>
      </header>

      {/* Добавить по нику */}
      <div className="space-y-1.5 border-b border-white/5 bg-ink-800/50 px-4 py-3">
        <div className="flex gap-2">
          <input
            className="input min-w-0 flex-1 text-xs"
            placeholder="Добавить по нику (mark_volkov)"
            value={addInput}
            onChange={(e) => setAddInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleAdd()}
          />
          <button
            onClick={() => void handleAdd()}
            disabled={addBusy || !addInput.trim()}
            className="btn-primary shrink-0 px-3 text-xs"
          >
            {addBusy ? '…' : 'Добавить'}
          </button>
        </div>
        {addErr && <p className="text-xs text-danger">{addErr}</p>}
      </div>

      {/* Вкладки */}
      <div className="flex border-b border-white/5">
        <button
          onClick={() => setTab('friends')}
          className={`flex-1 py-2 text-xs font-medium transition-colors
            ${tab === 'friends' ? 'text-fog-100 border-b-2 border-accent' : 'text-fog-400 hover:text-fog-200'}`}
        >
          Все ({friends.length})
        </button>
        <button
          onClick={() => setTab('pending')}
          className={`relative flex-1 py-2 text-xs font-medium transition-colors
            ${tab === 'pending' ? 'text-fog-100 border-b-2 border-accent' : 'text-fog-400 hover:text-fog-200'}`}
        >
          Заявки
          {pending.length > 0 && (
            <span className="absolute right-4 top-1 grid size-4 place-items-center rounded-full bg-dnd text-[9px] text-white">
              {pending.length}
            </span>
          )}
        </button>
      </div>

      {/* Список */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading && <p className="p-4 text-xs text-fog-400">Загрузка…</p>}
        {!loading && error && <p className="p-4 text-xs text-danger">{error}</p>}

        {tab === 'friends' && (
          <>
            {friends.length === 0 && !loading && (
              <p className="p-4 text-xs text-fog-400">Нет друзей. Добавьте по нику выше.</p>
            )}
            {friends.map(({ friendship, profile }) => (
              <div
                key={friendship.id}
                className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-ink-800/50"
              >
                <Avatar
                  username={profile.username}
                  displayName={profile.display_name}
                  avatarUrl={profile.avatar_url}
                  status={profile.status}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fog-100">
                    {profile.display_name || profile.username}
                  </p>
                  <p className="truncate text-xs text-fog-400">@{profile.username}</p>
                </div>
                {/* Кнопки — на ПК появляются при наведении */}
                <div className="flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                  <ActionBtn
                    title="Написать"
                    onClick={() => void handleOpenDm(profile.id, profile)}
                  >
                    💬
                  </ActionBtn>
                  <ActionBtn
                    title="Позвонить"
                    onClick={() => onCall(profile.id, profile)}
                  >
                    📞
                  </ActionBtn>
                  <ActionBtn
                    title="Удалить"
                    danger
                    onClick={() => void handleRemove(friendship.id)}
                  >
                    ✕
                  </ActionBtn>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'pending' && (
          <>
            {pending.length === 0 && !loading && (
              <p className="p-4 text-xs text-fog-400">Входящих заявок нет</p>
            )}
            {pending.map(({ friendship, profile }) => (
              <div
                key={friendship.id}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-ink-800/50"
              >
                <Avatar
                  username={profile.username}
                  displayName={profile.display_name}
                  avatarUrl={profile.avatar_url}
                  status={profile.status}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fog-100">
                    {profile.display_name || profile.username}
                  </p>
                  <p className="truncate text-xs text-fog-400">@{profile.username}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => void handleAccept(friendship.id)}
                    className="grid size-7 place-items-center rounded-full bg-online/20 text-sm text-online transition-colors hover:bg-online hover:text-white"
                    title="Принять"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => void handleRemove(friendship.id)}
                    className="grid size-7 place-items-center rounded-full bg-dnd/20 text-sm text-dnd transition-colors hover:bg-dnd hover:text-white"
                    title="Отклонить"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function ActionBtn({
  children, title, onClick, danger,
}: {
  children: ReactNode
  title: string
  onClick(): void
  danger?: boolean
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`grid size-7 place-items-center rounded-full text-sm transition-colors
        ${danger
          ? 'bg-dnd/20 text-dnd hover:bg-dnd hover:text-white'
          : 'bg-ink-700 text-fog-400 hover:bg-ink-600 hover:text-fog-100'}`}
    >
      {children}
    </button>
  )
}
