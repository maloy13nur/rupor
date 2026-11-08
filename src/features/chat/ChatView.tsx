import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { Avatar } from '@/features/ui/Avatar'
import { formatMessageTime } from '@/lib/format'
import type { Channel, Profile, Message } from '@/lib/db-types'

interface ChatViewProps {
  channel: Channel
  profile: Profile
}

export function ChatView({ channel, profile }: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Загрузка истории
  useEffect(() => {
    setLoading(true)
    setMessages([])
    supabase
      .from('messages')
      .select('*, author:profiles!messages_author_id_fkey(id,username,display_name,avatar_url,status)')
      .eq('channel_id', channel.id)
      .order('created_at', { ascending: true })
      .limit(100)
      .then(({ data }) => {
        setMessages((data ?? []) as unknown as Message[])
        setLoading(false)
      })
  }, [channel.id])

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel(`messages:${channel.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channel.id}` },
        (payload) => setMessages((prev) => [...prev, payload.new as Message]))
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [channel.id])

  // Автоскролл
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function send() {
    const content = text.trim()
    if (!content) return
    setText('')
    await supabase.from('messages').insert({
      channel_id: channel.id,
      author_id: profile.id,
      content,
      client_nonce: crypto.randomUUID(),
    })
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-ink-900">
      <header className="flex h-14 flex-shrink-0 items-center gap-2.5 border-b border-white/7 bg-ink-800/85 px-5 backdrop-blur-md">
        <span className="text-fog-400">#</span>
        <span className="text-[14.5px] font-semibold text-fog-100">{channel.name}</span>
        {channel.topic && (
          <>
            <span className="pl-2.5 text-[11.5px] text-fog-400 border-l border-white/13">{channel.topic}</span>
          </>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-5 pb-2 pt-5 scrollbar-thin">
        {loading && <p className="text-xs text-fog-400">Загрузка…</p>}
        {messages.map((msg) => {
          const author = msg.author as Profile | undefined
          return (
            <div key={msg.id} className="group flex items-start gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-white/[.028]">
              <Avatar
                username={author?.username ?? '?'}
                displayName={author?.display_name}
                avatarUrl={author?.avatar_url}
                status={author?.status}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-baseline gap-2">
                  <span className="text-[13.5px] font-semibold text-fog-100">
                    {author?.display_name || author?.username || 'Пользователь'}
                  </span>
                  <span className="text-[10.5px] tabular-nums text-fog-400">{formatMessageTime(msg.created_at)}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-fog-200">{msg.content}</p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div className="px-5 pb-4 pt-1.5">
        <div className="flex items-end gap-2 rounded-[14px] border border-white/13 bg-ink-800 py-1.5 pl-3.5 pr-2
                        transition-all focus-within:border-accent/70 focus-within:shadow-[0_0_0_3px_rgb(var(--grad-a)/0.13)]">
          <textarea rows={1}
            className="flex-1 resize-none bg-transparent py-1 text-[13.5px] text-fog-100 outline-none placeholder:text-fog-400"
            placeholder={`Написать в #${channel.name}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
          />
          <button onClick={() => void send()}
            disabled={!text.trim()}
            title="Отправить"
            className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-grad text-white
                       transition-transform hover:scale-105 disabled:opacity-30 disabled:hover:scale-100">
            ↑
          </button>
        </div>
      </div>
    </div>
  )
}
