import { TemplateTree } from '../templates'

// ─── LRU Cache with TTL ───────────────────────────────────────────────────────
// Two-pronged eviction: LRU (least recently used) + time-based TTL.
// This is a classic distributed systems interview topic — O(1) get/set
// using a Map (insertion-order guaranteed in JS) as a doubly-linked list substitute.
//
// Why this matters for VibeFiles:
//   - Identical images re-analyzed → save Groq API latency (~1-3s)
//   - Identical text inputs → instant re-generation
//   - Reduces rate-limit exposure on the backend

interface CacheEntry<T> {
  value: T
  expiresAt: number // Unix ms timestamp
  hits: number // Track usage for analytics
}

export class LRUCache<K, V> {
  private readonly maxSize: number
  private readonly ttlMs: number
  private readonly store: Map<K, CacheEntry<V>>

  // Stats — surfaced to telemetry
  private _hits = 0
  private _misses = 0
  private _evictions = 0

  constructor(maxSize: number, ttlMs: number) {
    this.maxSize = maxSize
    this.ttlMs = ttlMs
    this.store = new Map()
  }

  get(key: K): V | undefined {
    const entry = this.store.get(key)
    if (!entry) {
      this._misses++
      return undefined
    }
    // TTL check
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      this._misses++
      return undefined
    }
    // LRU: move to end (most recently used)
    this.store.delete(key)
    entry.hits++
    this._hits++
    this.store.set(key, entry)
    return entry.value
  }

  set(key: K, value: V): void {
    // Evict if already at capacity
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      // Delete the least recently used (first entry in Map)
      const lruKey = this.store.keys().next().value
      if (lruKey !== undefined) {
        this.store.delete(lruKey)
        this._evictions++
      }
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
      hits: 0,
    })
  }

  has(key: K): boolean {
    const entry = this.store.get(key)
    if (!entry) return false
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return false
    }
    return true
  }

  invalidate(key: K): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
    this._hits = 0
    this._misses = 0
    this._evictions = 0
  }

  // Purge all expired entries (call periodically)
  purgeExpired(): number {
    const now = Date.now()
    let purged = 0
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key)
        purged++
      }
    }
    return purged
  }

  get size(): number {
    return this.store.size
  }
  get hitRate(): number {
    const total = this._hits + this._misses
    return total === 0 ? 0 : this._hits / total
  }
  get stats() {
    return {
      size: this.store.size,
      maxSize: this.maxSize,
      hits: this._hits,
      misses: this._misses,
      evictions: this._evictions,
      hitRate: this.hitRate,
    }
  }
}

// ─── Singleton caches ─────────────────────────────────────────────────────────

// Image analysis cache: key = SHA-256 hash of base64, TTL = 1 hour
// Rationale: same image = same structure, no need to re-call API
export const imageAnalysisCache = new LRUCache<string, TemplateTree>(
  50, // max 50 entries
  3600_000, // 1 hour TTL
)

// Text parse cache: key = trimmed input text, TTL = 30 min
export const textParseCache = new LRUCache<string, TemplateTree>(100, 1800_000)

// ─── Fast hash for cache keys ─────────────────────────────────────────────────
// djb2 — O(n) string hash, good distribution, no crypto overhead needed
// Only used for cache keying, NOT security purposes.

export function hashString(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i)
    hash = hash >>> 0 // keep as unsigned 32-bit
  }
  return hash.toString(16)
}
