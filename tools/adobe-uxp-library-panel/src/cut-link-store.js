/**
 * Local Cut ↔ Premiere sequence link store (UXP prefs via localStorage).
 * Spec: adobe-uxp-cut-pushback-premiere.md
 */

const KEY = 'videon.adobe.cutSequenceLinks'

/**
 * @typedef {{
 *   cutId: string,
 *   platformProjectId: string,
 *   sequenceName?: string|null,
 *   sequenceGuid?: string|null,
 *   exportId?: string|null,
 *   openedAt: string,
 *   syncedUpdatedAt?: string|null,
 * }} CutSequenceLink
 */

export function readCutLinks() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}')
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

function writeCutLinks(map) {
  localStorage.setItem(KEY, JSON.stringify(map))
}

export function saveCutSequenceLink(link) {
  if (!link?.cutId || !link?.platformProjectId) return null
  const map = readCutLinks()
  const key = `${link.platformProjectId}:${link.cutId}`
  const prev = map[key] || {}
  map[key] = {
    cutId: link.cutId,
    platformProjectId: link.platformProjectId,
    sequenceName: link.sequenceName ?? prev.sequenceName ?? null,
    sequenceGuid: link.sequenceGuid ?? prev.sequenceGuid ?? null,
    exportId: link.exportId ?? prev.exportId ?? null,
    openedAt: link.openedAt || prev.openedAt || new Date().toISOString(),
    syncedUpdatedAt:
      link.syncedUpdatedAt !== undefined
        ? link.syncedUpdatedAt
        : (prev.syncedUpdatedAt ?? null),
  }
  writeCutLinks(map)
  return map[key]
}

export function getCutSequenceLink(platformProjectId, cutId) {
  if (!platformProjectId || !cutId) return null
  const map = readCutLinks()
  return map[`${platformProjectId}:${cutId}`] || null
}

/** Mark Premiere as caught up with this Cut `updatedAt`. */
export function markCutSequenceSynced(platformProjectId, cutId, syncedUpdatedAt) {
  if (!platformProjectId || !cutId) return null
  const prev = getCutSequenceLink(platformProjectId, cutId) || {
    cutId,
    platformProjectId,
    openedAt: new Date().toISOString(),
  }
  return saveCutSequenceLink({
    ...prev,
    cutId,
    platformProjectId,
    syncedUpdatedAt: syncedUpdatedAt || new Date().toISOString(),
  })
}
