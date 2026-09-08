/**
 * Process-local JPEG frame cache for assistant posters.
 * Spec: specs/api/media-frame.md — key (workspaceId, mediaAssetId, tMs, maxWidth).
 */

export type FrameCacheKeyParts = {
  workspaceId: string
  mediaAssetId: string
  tMs: number
  maxWidth: number
}

type CacheEntry = {
  bytes: Buffer
  expiresAt: number
}

const DEFAULT_TTL_MS = 5 * 60 * 1000
const MAX_ENTRIES = 256

const store = new Map<string, CacheEntry>()

export function frameCacheKey(parts: FrameCacheKeyParts): string {
  return `${parts.workspaceId}|${parts.mediaAssetId}|${parts.tMs}|${parts.maxWidth}`
}

export function getCachedFrame(key: string, now = Date.now()): Buffer | null {
  const hit = store.get(key)
  if (!hit) return null
  if (hit.expiresAt <= now) {
    store.delete(key)
    return null
  }
  return hit.bytes
}

export function setCachedFrame(
  key: string,
  bytes: Buffer,
  options?: { ttlMs?: number; now?: number },
): void {
  const now = options?.now ?? Date.now()
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS
  if (store.size >= MAX_ENTRIES) {
    const first = store.keys().next().value
    if (first != null) store.delete(first)
  }
  store.set(key, { bytes, expiresAt: now + ttlMs })
}

/** Test helper — clears process cache. */
export function clearFrameCache(): void {
  store.clear()
}
