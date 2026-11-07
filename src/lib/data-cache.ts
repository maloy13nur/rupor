interface CacheEntry<T> {
  value: T
  expiresAt: number
  createdAt: number
}

interface GetOptions {
  allowStale?: boolean
}

// Уведомления подписчиков при обновлении ключа
type Subscriber = () => void

const DEFAULT_TTL = 60_000   // 60 секунд
const MAX_ENTRIES = 200      // LRU-вытеснение при превышении

export class DataCache {
  private store = new Map<string, CacheEntry<unknown>>()
  private accessOrder: string[] = []  // LRU-очередь
  private subscribers = new Map<string, Set<Subscriber>>()

  get<T>(key: string, opts?: GetOptions): T | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined
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
    const entry = this.store.get(key)
    if (!entry) return true
    return Date.now() >= entry.expiresAt
  }

  set<T>(key: string, value: T, ttlMs = DEFAULT_TTL): void {
    this.evictIfNeeded()
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs, createdAt: Date.now() })
    this.touch(key)
    // Уведомляем подписчиков
    this.subscribers.get(key)?.forEach((cb) => cb())
  }

  invalidate(key: string): void {
    this.store.delete(key)
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
