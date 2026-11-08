interface RuporMarkProps {
  className?: string
}

export function RuporMark({ className }: RuporMarkProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
      <rect x="3" y="12" width="3.6" height="8" rx="1.8" />
      <rect x="9" y="8" width="3.6" height="16" rx="1.8" />
      <rect x="15" y="4" width="3.6" height="24" rx="1.8" />
      <rect x="21" y="9" width="3.6" height="14" rx="1.8" />
      <rect x="27" y="13" width="3.6" height="6" rx="1.8" />
    </svg>
  )
}
