import { useState, type FormEvent } from 'react'
import { useAuth } from './useAuth'
import { RuporMark } from '@/features/ui/RuporMark'

const MIN_PASSWORD = 6
const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/

// Высоты столбиков эквалайзера в брендовой панели
const EQ_BARS = [22, 34, 44, 30, 18, 28, 38, 24]

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
    <div className="grid h-screen grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] bg-ink-900">
      {/* ── Брендовая панель ── */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-white/7 px-12 py-11 lg:flex">
        <div
          className="pointer-events-none absolute -left-[30%] -top-[30%] h-[80%] w-[130%] blur-3xl"
          style={{ background: 'radial-gradient(60% 60% at 30% 40%, rgb(var(--grad-a) / .30), transparent 70%)' }}
        />
        <div
          className="pointer-events-none absolute -bottom-[35%] -left-[15%] h-[85%] w-[125%] blur-3xl"
          style={{ background: 'radial-gradient(55% 55% at 55% 55%, rgb(var(--grad-b) / .22), transparent 72%)' }}
        />

        <div className="relative z-10 flex items-center gap-3">
          <div className="rounded-xl border border-white/13 bg-grad-soft p-1.5">
            <RuporMark className="size-6 text-[rgb(var(--grad-a))]" />
          </div>
          <b className="text-[15px] font-bold uppercase tracking-[0.14em]">Рупор</b>
        </div>

        <div className="relative z-10">
          <h1 className="max-w-[11ch] text-4xl font-bold leading-[1.08] tracking-tight xl:text-[44px]">
            Голос команды
            <br />
            всегда <span className="text-grad">на связи</span>
          </h1>
          <p className="mt-4 max-w-[34ch] text-sm text-fog-300">
            Серверы, каналы и звонки один-на-один. Без лишнего шума — только то,
            что нужно, чтобы работать вместе.
          </p>

          <div className="mt-7 flex flex-wrap gap-2">
            {['Голосовые каналы', 'Звонки 1-на-1', 'Личные сообщения'].map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/7 bg-white/[.035] px-3.5 py-1.5 text-xs font-medium text-fog-300"
              >
                <i className="size-1.5 rounded-full bg-[rgb(var(--grad-a))]" />
                {t}
              </span>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex h-11 items-end gap-1.5 opacity-85" aria-hidden>
          {EQ_BARS.map((h, i) => (
            <span
              key={i}
              className="eq-bar w-1 rounded-full bg-gradient-to-b from-[rgb(var(--grad-b))] to-[rgb(var(--grad-a))]"
              style={{ height: `${h}px`, animationDelay: `${i * 0.12}s` }}
            />
          ))}
        </div>
      </div>

      {/* ── Форма ── */}
      <div className="grid place-items-center bg-gradient-to-b from-ink-800 to-ink-900 px-10 py-10">
        <div className="w-full max-w-[330px]">
          <h2 className="text-[23px] font-semibold tracking-tight">
            {isSignup ? 'Создать аккаунт' : 'С возвращением'}
          </h2>
          <p className="mb-6 mt-1 text-[13px] text-fog-400">
            {isSignup ? 'Заполните данные ниже' : 'Войдите, чтобы продолжить'}
          </p>

          {errorText && (
            <p className="mb-3.5 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-xs text-red-300">
              {errorText}
            </p>
          )}

          <form onSubmit={submit}>
            <div className="mb-3.5">
              <label className="mb-1.5 block text-[11.5px] font-semibold uppercase tracking-wider text-fog-400">
                Почта
              </label>
              <input
                className="input"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {isSignup && (
              <div className="mb-3.5">
                <label className="mb-1.5 block text-[11.5px] font-semibold uppercase tracking-wider text-fog-400">
                  Ник
                </label>
                <input
                  className="input"
                  type="text"
                  placeholder="mark_volkov"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
                {username && !usernameOk && (
                  <p className="mt-1.5 text-xs text-idle">3–32 символа, только a-z, 0-9, _</p>
                )}
              </div>
            )}

            <div className="mb-3.5">
              <label className="mb-1.5 block text-[11.5px] font-semibold uppercase tracking-wider text-fog-400">
                Пароль
              </label>
              <div className="relative">
                <input
                  className="input pr-20"
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-fog-400 transition-colors hover:text-fog-200"
                >
                  {showPass ? 'Скрыть' : 'Показать'}
                </button>
              </div>
            </div>

            <button type="submit" disabled={busy} className="btn-primary mt-2 w-full">
              {busy ? 'Подождите…' : isSignup ? 'Зарегистрироваться' : 'Войти'}
            </button>
          </form>

          <p className="mt-6 text-center text-[12.5px] text-fog-400">
            {isSignup ? 'Уже есть аккаунт? ' : 'Нет аккаунта? '}
            <button
              onClick={() => {
                setMode(isSignup ? 'signin' : 'signup')
                auth.clearError()
                setHint(null)
              }}
              className="font-semibold text-[rgb(var(--grad-a))] transition-opacity hover:opacity-75"
            >
              {isSignup ? 'Войти' : 'Зарегистрироваться'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
