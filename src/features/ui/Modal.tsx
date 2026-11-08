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
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/65 backdrop-blur-md"
         onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-ink-700 p-5 shadow-2xl"
           onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-[15px] font-semibold tracking-tight text-fog-100">{title}</h2>
        {children}
      </div>
    </div>
  )
}
