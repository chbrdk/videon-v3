const LOCK_PREFIX = 'videon.cut.lockedClipIds.'

export function lockedClipIdsStorageKey(cutId: string): string {
  return `${LOCK_PREFIX}${cutId}`
}

export function readLockedClipIds(cutId: string): string[] {
  if (typeof window === 'undefined' || !cutId) return []
  try {
    const raw = window.localStorage.getItem(lockedClipIdsStorageKey(cutId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
  } catch {
    return []
  }
}

export function writeLockedClipIds(cutId: string, ids: string[]): void {
  if (typeof window === 'undefined' || !cutId) return
  const unique = [...new Set(ids.filter(Boolean))]
  window.localStorage.setItem(lockedClipIdsStorageKey(cutId), JSON.stringify(unique))
}

/** Drop ids that no longer exist on the cut. Skip prune while known set is empty (load race). */
export function pruneLockedClipIds(lockedIds: string[], knownIds: Iterable<string>): string[] {
  const known = new Set(knownIds)
  if (known.size === 0) return lockedIds
  return lockedIds.filter((id) => known.has(id))
}
