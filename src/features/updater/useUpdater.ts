import { useState, useCallback } from 'react'

export type UpdaterStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'

export function useUpdater() {
  const [status, setStatus] = useState<UpdaterStatus>('idle')
  const [newVersion, setNewVersion] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  const check = useCallback(async () => {
    setStatus('checking')
    try {
      const { check: checkUpdate } = await import('@tauri-apps/plugin-updater')
      const update = await checkUpdate()
      if (update?.available) {
        setNewVersion(update.version ?? null)
        setStatus('available')
      } else {
        setStatus('idle')
      }
    } catch {
      setStatus('idle')
    }
  }, [])

  const install = useCallback(async () => {
    setStatus('downloading')
    setProgress(0)
    try {
      const { check: checkUpdate } = await import('@tauri-apps/plugin-updater')
      const update = await checkUpdate()
      if (!update?.available) { setStatus('idle'); return }

      let downloaded = 0
      let total = 0
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength
          setProgress(total > 0 ? Math.round((downloaded / total) * 100) : 50)
        } else if (event.event === 'Finished') {
          setProgress(100)
          setStatus('ready')
        }
      })
    } catch {
      setStatus('error')
    }
  }, [])

  const relaunch = useCallback(async () => {
    try {
      const { relaunch: doRelaunch } = await import('@tauri-apps/plugin-process')
      await doRelaunch()
    } catch {}
  }, [])

  return { status, newVersion, progress, check, install, relaunch }
}
