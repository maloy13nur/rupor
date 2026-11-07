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
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex items-center gap-2 border-b border-white/5 px-4 py-3 bg-ink-800">
        <span className="text-fog-400">#</span>
        <span className="font-semibold text-fog-100">{channel.name}</span>
        {channel.topic && <span className="ml-2 text-xs text-fog-400 truncate">{channel.topic}</span>}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 scrollbar-thin">
        {loading && <p className="text-xs text-fog-400">Загрузка…</p>}
        {messages.map((msg) => {
          const author = msg.author as Profile | undefined
          return (
            <div key={msg.id} className="group flex items-start gap-3 py-1 hover:bg-ink-800/40 rounded px-2 -mx-2">
              <Avatar
                username={author?.username ?? '?'}
                displayName={author?.display_name}
                avatarUrl={author?.avatar_url}
                status={author?.status}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-fog-100">
                    {author?.display_name || author?.username || 'Пользователь'}
                  </span>
                  <span className="text-[10px] text-fog-400">{formatMessageTime(msg.created_at)}</span>
                </div>
                <p className="text-sm text-fog-200 whitespace-pre-wrap break-words">{msg.content}</p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-white/5 px-4 py-3 bg-ink-800">
        <div className="flex items-end gap-2 rounded-xl bg-ink-700 px-4 py-2">
          <textarea rows={1}
            className="flex-1 resize-none bg-transparent text-fog-100 placeholder:text-fog-400 outline-none text-sm"
            placeholder={`Написать в #${channel.name}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
          />
          <button onClick={() => void send()}
            disabled={!text.trim()}
            className="text-accent hover:text-accent/80 disabled:opacity-30 transition-colors pb-0.5">
            ➤
          </button>
        </div>
      </div>
    </div>
  )
}
