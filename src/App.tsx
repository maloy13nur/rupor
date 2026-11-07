import { useEffect } from 'react'
import { useAuth } from '@/features/auth/useAuth'
import { AuthScreen } from '@/features/auth/AuthScreen'
import { AppShell } from '@/features/shell/AppShell'
import { useUpdater } from '@/features/updater/useUpdater'
import { UpdateBanner } from '@/features/updater/UpdateBanner'

export default function App() {
  const auth = useAuth()
  const updater = useUpdater()

  useEffect(() => {
    void updater.check()
  }, [])

  if (auth.loading) {
    return (
      <div className="grid h-screen place-items-center bg-ink-900">
        <div className="size-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  return (
    <>
      {!auth.user || !auth.profile ? (
        <AuthScreen />
      ) : (
        <AppShell profile={auth.profile} onSignOut={auth.signOut} />
      )}
      <UpdateBanner
        status={updater.status}
        version={updater.newVersion}
        progress={updater.progress}
        onInstall={updater.install}
        onRelaunch={updater.relaunch}
      />
    </>
  )
}
