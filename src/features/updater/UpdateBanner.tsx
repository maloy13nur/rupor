import type { UpdaterStatus } from './useUpdater'

interface Props {
  status: UpdaterStatus
  version: string | null
  progress: number
  onInstall(): void
  onRelaunch(): void
}

export function UpdateBanner({ status, version, progress, onInstall, onRelaunch }: Props) {
  if (status === 'idle' || status === 'checking') return null

  if (status === 'available') {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center gap-3 border-t border-white/10 bg-ink-700/95 px-5 py-3 shadow-[0_-12px_32px_-16px_rgb(0_0_0/0.9)] backdrop-blur-md">
        <span className="size-2 flex-shrink-0 animate-pulse rounded-full bg-online" />
        <span className="flex-1 text-[12.5px] text-fog-200">
          Доступно обновление{version ? ` v${version}` : ''}
        </span>
        <button onClick={onInstall} className="btn-primary !px-3.5 !py-1.5 !text-xs">
          Обновить
        </button>
      </div>
    )
  }

  if (status === 'downloading') {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-ink-700/95 px-5 py-3 shadow-[0_-12px_32px_-16px_rgb(0_0_0/0.9)] backdrop-blur-md">
        <div className="mb-1.5 flex justify-between text-[12.5px] text-fog-200">
          <span>Загрузка обновления…</span>
          <span className="tabular-nums text-fog-400">{progress}%</span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-ink-900">
          <div className="bg-grad h-full rounded-full transition-all duration-300"
               style={{ width: `${progress}%` }} />
        </div>
      </div>
    )
  }

  if (status === 'ready') {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center gap-3 border-t border-white/10 bg-ink-700/95 px-5 py-3 shadow-[0_-12px_32px_-16px_rgb(0_0_0/0.9)] backdrop-blur-md">
        <span className="flex-1 text-[12.5px] text-fog-200">Обновление загружено — перезапустите приложение</span>
        <button
          onClick={onRelaunch}
          className="rounded-lg bg-online px-3.5 py-1.5 text-xs font-semibold text-white
                     transition-all hover:brightness-110 active:scale-95"
        >
          Перезапустить
        </button>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center gap-3 border-t border-white/10 bg-ink-700/95 px-5 py-3 shadow-[0_-12px_32px_-16px_rgb(0_0_0/0.9)] backdrop-blur-md">
        <span className="flex-1 text-[12.5px] text-fog-400">Не удалось загрузить обновление</span>
      </div>
    )
  }

  return null
}
