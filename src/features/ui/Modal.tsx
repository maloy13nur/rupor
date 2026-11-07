import { useEffect, type ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onClose(): void
  title: string
  children: ReactNode
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm"
         onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-ink-800 p-5 shadow-xl ring-1 ring-white/5"
           onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-base font-semibold text-fog-100">{title}</h2>
        {children}
      </div>
    </div>
  )
}
