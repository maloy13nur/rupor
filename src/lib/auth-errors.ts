// Перевод ошибок Supabase Auth на русский
export function translateAuthError(message: string, status?: number): string {
  if (status === 429) return 'Слишком много попыток — подождите минуту'
  if (message.includes('Invalid login credentials')) return 'Неверная почта или пароль'
  if (message.includes('Email not confirmed')) return 'Почта не подтверждена — войдите и подтвердите'
  if (message.includes('User already registered')) return 'Пользователь с этой почтой уже есть'
  if (message.includes('Password should be')) return 'Пароль слишком короткий (минимум 6 символов)'
  if (message.includes('Unable to validate email')) return 'Некорректный адрес почты'
  if (message.includes('Signup is disabled')) return 'Регистрация отключена администратором'
  if (message.includes('USERNAME_TAKEN') || message.includes('23505')) return 'Этот ник уже занят'
  if (message.includes('network') || message.includes('fetch')) return 'Нет соединения с сервером'
  return message
}
