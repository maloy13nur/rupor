// Форматирование дат для сообщений
export function formatMessageTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const isYesterday = new Date(now.getTime() - 86400000).toDateString() === d.toDateString()

  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  if (isToday) return time
  if (isYesterday) return `Вчера в ${time}`
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ` в ${time}`
}
