import type { UserStatus } from '@/lib/db-types'

const STATUS_COLOR: Record<UserStatus, string> = {
  online: 'bg-online',
  idle:   'bg-idle',
  dnd:    'bg-dnd',
  offline:'bg-fog-400',
}

const SIZE: Record<string, { avatar: string; dot: string }> = {
  sm: { avatar: 'size-7 text-xs',  dot: 'size-2' },
  md: { avatar: 'size-9 text-sm',  dot: 'size-2.5' },
  lg: { avatar: 'size-12 text-base', dot: 'size-3' },
}

interface AvatarProps {
  username: string
  displayName?: string
  avatarUrl?: string | null
  status?: UserStatus
  size?: 'sm' | 'md' | 'lg'
}

export function Avatar({ username, displayName, avatarUrl, status, size = 'md' }: AvatarProps) {
  const s = SIZE[size]
  const initials = (displayName || username).slice(0, 2).toUpperCase()

  return (
    <div className="relative inline-flex shrink-0">
      {avatarUrl ? (
        <img src={avatarUrl} alt={username}
          className={`${s.avatar} rounded-full object-cover`} />
      ) : (
        <div className={`${s.avatar} rounded-full bg-grad-soft text-fog-100 font-semibold
                         ring-1 ring-white/10 grid place-items-center select-none`}>
          {initials}
        </div>
      )}
      {status && (
        <span className={`absolute -bottom-0.5 -right-0.5 ${s.dot} rounded-full
                          border-2 border-ink-900 ${STATUS_COLOR[status]}`} />
      )}
    </div>
  )
}
