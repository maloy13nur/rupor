import { useEffect } from 'react'
import { useAuth } from '@/features/auth/useAuth'
import { AuthScreen } from '@/features/auth/AuthScreen'
import { AppShell } from '@/features/shell/AppShell'

async function checkForUpdates() {
  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    const update = await check()
    if (update?.available) {
      await update.downloadAndInstall()
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    }
  } catch {
    // Updater недоступен в dev-режиме или pubkey не настроен — игнорируем
  }
}

export default function App() {
  const auth = useAuth()

  useEffect(() => {
    void checkForUpdates()
  }, [])

  if (auth.loading) {
    return (
      <div className="grid h-screen place-items-center bg-ink-900">
        <div className="size-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  if (!auth.user || !auth.profile) return <AuthScreen />
  return <AppShell profile={auth.profile} onSignOut={auth.signOut} />
}
