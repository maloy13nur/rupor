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
      <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center gap-3 border-t border-ink-700 bg-ink-850 px-4 py-2.5 shadow-lg">
        <span className="size-2 rounded-full bg-accent animate-pulse flex-shrink-0" />
        <span className="flex-1 text-xs text-fog-300">
          Доступно обновление{version ? ` v${version}` : ''}
        </span>
        <button
          onClick={onInstall}
          className="rounded-md bg-accent px-3 py-1 text-xs font-semibold text-white hover:brightness-110 active:scale-95 transition-all"
        >
          Обновить
        </button>
      </div>
    )
  }

  if (status === 'downloading') {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-ink-700 bg-ink-850 px-4 py-2.5 shadow-lg">
        <div className="mb-1.5 text-xs text-fog-300">Загрузка обновления… {progress}%</div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-ink-700">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    )
  }

  if (status === 'ready') {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center gap-3 border-t border-ink-700 bg-ink-850 px-4 py-2.5 shadow-lg">
        <span className="flex-1 text-xs text-fog-300">Обновление загружено — перезапустите приложение</span>
        <button
          onClick={onRelaunch}
          className="rounded-md bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:brightness-110 active:scale-95 transition-all"
        >
          Перезапустить
        </button>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center gap-3 border-t border-ink-700 bg-ink-850 px-4 py-2.5 shadow-lg">
        <span className="flex-1 text-xs text-fog-400">Не удалось загрузить обновление</span>
      </div>
    )
  }

  return null
}
