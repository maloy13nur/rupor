import { useState, type FormEvent } from 'react'
import { useAuth } from './useAuth'

const MIN_PASSWORD = 6
const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/

export function AuthScreen() {
  const auth = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const isSignup = mode === 'signup'

  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)

  const usernameOk = USERNAME_RE.test(username)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setHint(null)
    auth.clearError()

    if (!email.trim().includes('@')) { setHint('Укажите корректную почту'); return }
    if (isSignup && !usernameOk) { setHint('Ник: 3–32 символа, только a-z, 0-9, _'); return }
    if (password.length < MIN_PASSWORD) { setHint(`Пароль не короче ${MIN_PASSWORD} символов`); return }

    setBusy(true)
    try {
      if (isSignup) {
        const result = await auth.signUp(email.trim(), password, username.trim())
        if (result.needsConfirm) {
          setHint('Аккаунт создан! Войдите с этими данными.')
          setMode('signin')
        }
      } else {
        await auth.signIn(email.trim(), password)
      }
    } finally {
      setBusy(false)
    }
  }

  const errorText = hint ?? auth.error

  return (
    <div className="grid h-screen place-items-center bg-ink-900 bg-[radial-gradient(ellipse_at_top,_#1a1d2e_0%,_#0f1117_60%)]">
      <div className="w-full max-w-sm space-y-6 rounded-2xl bg-ink-800 p-8 shadow-2xl ring-1 ring-white/8">
        {/* Логотип */}
        <div className="flex flex-col items-center gap-1">
          <div className="mb-1 flex size-12 items-center justify-center rounded-2xl bg-accent/15 text-2xl ring-1 ring-accent/30">
            📢
          </div>
          <h1 className="text-lg font-bold tracking-tight text-fog-100">
            {isSignup ? 'Создать аккаунт' : 'Войти в Рупор'}
          </h1>
          <p className="text-xs text-fog-400">
            {isSignup ? 'Заполните данные ниже' : 'Рады видеть вас снова'}
          </p>
        </div>

        {errorText && (
          <p className="rounded-lg bg-danger/15 px-3 py-2 text-xs text-danger">{errorText}</p>
        )}

        <form onSubmit={submit} className="space-y-3">
          <input className="input" type="email" placeholder="Почта" autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)} />

          {isSignup && (
            <div>
              <input className="input" type="text" placeholder="Ник (mark_volkov)"
                autoComplete="username" value={username}
                onChange={(e) => setUsername(e.target.value)} />
              {username && !usernameOk && (
                <p className="mt-1 text-xs text-idle">3–32 символа, только a-z, 0-9, _</p>
              )}
            </div>
          )}

          <div className="relative">
            <input className="input pr-10" type={showPass ? 'text' : 'password'}
              placeholder="Пароль" autoComplete={isSignup ? 'new-password' : 'current-password'}
              value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" onClick={() => setShowPass(!showPass)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fog-400 hover:text-fog-200">
              {showPass ? '🙈' : '👁'}
            </button>
          </div>

          <button type="submit" disabled={busy} className="btn-primary w-full mt-1">
            {busy ? 'Подождите…' : isSignup ? 'Зарегистрироваться' : 'Войти'}
          </button>
        </form>

        <p className="text-center text-xs text-fog-400">
          {isSignup ? 'Уже есть аккаунт? ' : 'Нет аккаунта? '}
          <button onClick={() => { setMode(isSignup ? 'signin' : 'signup'); auth.clearError(); setHint(null) }}
            className="font-medium text-accent hover:underline">
            {isSignup ? 'Войти' : 'Зарегистрироваться'}
          </button>
        </p>
      </div>
    </div>
  )
}
