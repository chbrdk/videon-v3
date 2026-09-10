/**
 * Pure cache-index helpers (no UXP) — eviction + stats.
 * Spec: adobe-uxp-library-panel.md
 */

/** Default soft cap for local source media cache. */
export const DEFAULT_MAX_CACHE_BYTES = 5 * 1024 * 1024 * 1024 // 5 GiB
export const DEFAULT_MAX_CACHE_ENTRIES = 80

/**
 * @typedef {{ path?: string, fileName?: string, at?: number, bytes?: number }} CacheEntry
 * @typedef {Record<string, CacheEntry>} CacheIndex
 */

export function emptyCacheIndex() {
  return /** @type {CacheIndex} */ ({})
}

export function parseCacheIndex(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyCacheIndex()
  /** @type {CacheIndex} */
  const out = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!key || !value || typeof value !== 'object') continue
    out[key] = {
      path: typeof value.path === 'string' ? value.path : undefined,
      fileName: typeof value.fileName === 'string' ? value.fileName : undefined,
      at: Number.isFinite(Number(value.at)) ? Number(value.at) : 0,
      bytes: Number.isFinite(Number(value.bytes)) ? Number(value.bytes) : 0,
    }
  }
  return out
}

export function cacheStats(index) {
  const entries = Object.entries(index || {})
  let bytes = 0
  for (const [, entry] of entries) bytes += Number(entry.bytes) || 0
  return { count: entries.length, bytes }
}

export function formatCacheBytes(bytes) {
  const n = Math.max(0, Number(bytes) || 0)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/**
 * Oldest-first keys to remove until under maxBytes / maxEntries after adding `incomingBytes`.
 * Never includes `keepKey`.
 */
export function pickEvictionKeys(index, options = {}) {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_CACHE_BYTES
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_CACHE_ENTRIES
  const incomingBytes = Math.max(0, Number(options.incomingBytes) || 0)
  const keepKey = options.keepKey || null

  const entries = Object.entries(index || {}).filter(([key]) => key !== keepKey)
  entries.sort((a, b) => (a[1].at || 0) - (b[1].at || 0))

  let bytes = entries.reduce((sum, [, e]) => sum + (Number(e.bytes) || 0), 0) + incomingBytes
  let count = entries.length + (keepKey && index?.[keepKey] ? 0 : 1)

  /** @type {string[]} */
  const evict = []
  for (const [key, entry] of entries) {
    if (count <= maxEntries && bytes <= maxBytes) break
    evict.push(key)
    bytes -= Number(entry.bytes) || 0
    count -= 1
  }
  return evict
}

export function removeKeysFromIndex(index, keys) {
  const next = { ...index }
  for (const key of keys) delete next[key]
  return next
}
