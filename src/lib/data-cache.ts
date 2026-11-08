interface CacheEntry<T> {
  value: T
  expiresAt: number
  createdAt: number
}

interface GetOptions {
  allowStale?: boolean
  /** Не читать с диска — только из памяти */
  memoryOnly?: boolean
}

// Уведомления подписчиков при обновлении ключа
type Subscriber = () => void

const DEFAULT_TTL = 60_000   // 60 секунд
const MAX_ENTRIES = 200      // LRU-вытеснение при превышении
const LS_PREFIX = 'rupor.cache:'
// На диске держим дольше, чем в памяти: он нужен только чтобы
// показать прошлый экран мгновенно на старте, пока идёт сетевой запрос.
const DISK_TTL = 7 * 24 * 60 * 60_000

export class DataCache {
  private store = new Map<string, CacheEntry<unknown>>()
  private accessOrder: string[] = []  // LRU-очередь
  private subscribers = new Map<string, Set<Subscriber>>()

  get<T>(key: string, opts?: GetOptions): T | null {
    let entry = this.store.get(key) as CacheEntry<T> | undefined

    // Промах в памяти — пробуем диск (только прошлый запуск приложения)
    if (!entry && !opts?.memoryOnly) {
      const disk = this.readDisk<T>(key)
      if (disk) {
        // С диска берём значение для мгновенной отрисовки, но «свежим»
        // в памяти считаем не дольше обычного TTL — иначе приложение
        // неделю не ходило бы за актуальными данными.
        entry = {
          value: disk.value,
          createdAt: disk.createdAt,
          expiresAt: Math.min(disk.expiresAt, Date.now() + DEFAULT_TTL),
        }
        this.store.set(key, entry as CacheEntry<unknown>)
        this.touch(key)
      }
    }
    if (!entry) return null
    // Запись не протухла — возвращаем
    if (Date.now() < entry.expiresAt) {
      this.touch(key)
      return entry.value
    }
    // Запись протухла, но разрешено возвращать stale
    if (opts?.allowStale) return entry.value
    return null
  }

  isStale(key: string): boolean {
    const entry = this.store.get(key) ?? this.readDisk(key)
    if (!entry) return true
    return Date.now() >= entry.expiresAt
  }

  set<T>(key: string, value: T, ttlMs = DEFAULT_TTL, persist = false): void {
    this.evictIfNeeded()
    const entry = { value, expiresAt: Date.now() + ttlMs, createdAt: Date.now() }
    this.store.set(key, entry as CacheEntry<unknown>)
    this.touch(key)
    if (persist) this.writeDisk(key, entry)
    // Уведомляем подписчиков
    this.subscribers.get(key)?.forEach((cb) => cb())
  }

  invalidate(key: string): void {
    this.store.delete(key)
    try { localStorage.removeItem(LS_PREFIX + key) } catch { /* приватный режим */ }
    const idx = this.accessOrder.indexOf(key)
    if (idx !== -1) this.accessOrder.splice(idx, 1)
  }

  invalidatePrefix(prefix: string): void {
    for (const key of [...this.store.keys()]) {
      if (key.startsWith(prefix)) this.invalidate(key)
    }
  }

  subscribe(key: string, cb: Subscriber): () => void {
    if (!this.subscribers.has(key)) this.subscribers.set(key, new Set())
    this.subscribers.get(key)!.add(cb)
    return () => this.subscribers.get(key)?.delete(cb)
  }

  clear(): void {
    this.store.clear()
    this.accessOrder = []
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i)
        if (k?.startsWith(LS_PREFIX)) localStorage.removeItem(k)
      }
    } catch { /* приватный режим */ }
  }

  private writeDisk<T>(key: string, entry: CacheEntry<T>): void {
    try {
      localStorage.setItem(LS_PREFIX + key, JSON.stringify({
        value: entry.value,
        expiresAt: Math.min(entry.expiresAt, Date.now() + DISK_TTL),
        createdAt: entry.createdAt,
      }))
    } catch { /* переполнение квоты — не критично */ }
  }

  private readDisk<T>(key: string): CacheEntry<T> | null {
    try {
      const raw = localStorage.getItem(LS_PREFIX + key)
      if (!raw) return null
      const parsed = JSON.parse(raw) as CacheEntry<T>
      if (!parsed || typeof parsed.expiresAt !== 'number') return null
      if (Date.now() >= parsed.expiresAt) {
        localStorage.removeItem(LS_PREFIX + key)
        return null
      }
      return parsed
    } catch {
      return null
    }
  }

  private touch(key: string): void {
    const idx = this.accessOrder.indexOf(key)
    if (idx !== -1) this.accessOrder.splice(idx, 1)
    this.accessOrder.push(key)
  }

  private evictIfNeeded(): void {
    while (this.store.size >= MAX_ENTRIES && this.accessOrder.length > 0) {
      const oldest = this.accessOrder.shift()!
      this.store.delete(oldest)
    }
  }
}

export const cache = new DataCache()
