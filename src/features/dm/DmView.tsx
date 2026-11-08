// src/features/dm/DmView.tsx
import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { Avatar } from '@/features/ui/Avatar'
import { formatMessageTime } from '@/lib/format'
import type { Profile, DmMessage } from '@/lib/db-types'

interface DmViewProps {
  dmChannelId: string
  profile: Profile
  friendProfile: Profile
  /** Нажата кнопка «Позвонить» */
  onCall(): void
}

export function DmView({ dmChannelId, profile, friendProfile, onCall }: DmViewProps) {
  const [messages, setMessages] = useState<DmMessage[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sendErr, setSendErr] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Загрузка истории
  useEffect(() => {
    let alive = true
    setLoading(true)
    setMessages([])
    setSendErr(null)
    supabase
      .from('dm_messages')
      .select('*')
      .eq('channel_id', dmChannelId)
      .order('created_at', { ascending: true })
      .limit(100)
      .then(({ data, error }) => {
        if (!alive) return
        if (error) setSendErr(error.message)
        setMessages((data ?? []) as unknown as DmMessage[])
        setLoading(false)
      })
    return () => { alive = false }
  }, [dmChannelId])

  // Realtime: своё сообщение (локальный echo) заменяем на серверное по client_nonce
  useEffect(() => {
    const ch = supabase
      .channel(`dm:${dmChannelId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dm_messages', filter: `channel_id=eq.${dmChannelId}` },
        (payload) => {
          const incoming = payload.new as DmMessage
          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev
            const idx = incoming.client_nonce
              ? prev.findIndex((m) => m.client_nonce === incoming.client_nonce)
              : -1
            if (idx >= 0) {
              const next = prev.slice()
              next[idx] = incoming
              return next
            }
            return [...prev, incoming]
          })
        })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [dmChannelId])

  // Автоскролл
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function send() {
    const content = text.trim()
    if (!content) return
    const nonce = crypto.randomUUID()
    const optimistic: DmMessage = {
      id: `local-${nonce}`,
      channel_id: dmChannelId,
      author_id: profile.id,
      content,
      client_nonce: nonce,
      edited_at: null,
      created_at: new Date().toISOString(),
    }
    setText('')
    setSendErr(null)
    setMessages((prev) => [...prev, optimistic])

    const { error } = await supabase.from('dm_messages').insert({
      channel_id: dmChannelId,
      author_id: profile.id,
      content,
      client_nonce: nonce,
    })

    // Ошибка отправки — убираем «пузырь» и возвращаем текст в поле
    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
      setText(content)
      setSendErr('Не удалось отправить сообщение')
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-ink-900">
      {/* Заголовок */}
      <header className="flex h-14 flex-shrink-0 items-center justify-between gap-2 border-b border-white/7 bg-ink-800/85 px-5 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar
            username={friendProfile.username}
            displayName={friendProfile.display_name}
            avatarUrl={friendProfile.avatar_url}
            status={friendProfile.status}
            size="sm"
          />
          <span className="truncate text-[14.5px] font-semibold text-fog-100">
            {friendProfile.display_name || friendProfile.username}
          </span>
        </div>
        <button
          onClick={onCall}
          title="Голосовой звонок"
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-online/14 px-3 py-1.5 text-[13px] font-medium text-online transition-colors hover:bg-online hover:text-white"
        >
          📞 Позвонить
        </button>
      </header>

      {/* Сообщения */}
      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-5 pb-2 pt-5 scrollbar-thin">
        {loading && <p className="text-xs text-fog-400">Загрузка…</p>}
        {!loading && messages.length === 0 && (
          <p className="text-xs text-fog-400">Начните переписку — это личный чат.</p>
        )}
        {messages.map((msg) => {
          const isMe = msg.author_id === profile.id
          const author = isMe ? profile : friendProfile
          return (
            <div
              key={msg.id}
              className="group flex items-start gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-white/[.028]"
            >
              <Avatar
                username={author.username}
                displayName={author.display_name}
                avatarUrl={author.avatar_url}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-baseline gap-2">
                  <span className="truncate text-[13.5px] font-semibold text-fog-100">
                    {author.display_name || author.username}
                  </span>
                  <span className="shrink-0 text-[10.5px] tabular-nums text-fog-400">
                    {formatMessageTime(msg.created_at)}
                  </span>
                  {msg.id.startsWith('local-') && (
                    <span className="shrink-0 text-[10.5px] text-fog-400">отправка…</span>
                  )}
                </div>
                <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-fog-200">{msg.content}</p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Ввод */}
      <div className="px-5 pb-4 pt-1.5">
        {sendErr && <p className="mb-1.5 text-xs text-danger">{sendErr}</p>}
        <div className="flex items-end gap-2 rounded-[14px] border border-white/13 bg-ink-800 py-1.5 pl-3.5 pr-2
                        transition-all focus-within:border-accent/70 focus-within:shadow-[0_0_0_3px_rgb(var(--grad-a)/0.13)]">
          <textarea
            rows={1}
            className="flex-1 resize-none bg-transparent py-1 text-[13.5px] text-fog-100 outline-none placeholder:text-fog-400"
            placeholder={`Написать ${friendProfile.display_name || friendProfile.username}…`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
          />
          <button
            onClick={() => void send()}
            disabled={!text.trim()}
            title="Отправить"
            className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-grad text-white
                       transition-transform hover:scale-105 disabled:opacity-30 disabled:hover:scale-100"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  )
}
