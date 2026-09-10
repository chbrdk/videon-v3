/**
 * Local Cut ↔ Premiere sequence link store (UXP prefs via localStorage).
 * Spec: adobe-uxp-cut-pushback-premiere.md
 */

const KEY = 'videon.adobe.cutSequenceLinks'

/**
 * @typedef {{ cutId: string, platformProjectId: string, sequenceName?: string|null, exportId?: string|null, openedAt: string }} CutSequenceLink
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
  map[key] = {
    cutId: link.cutId,
    platformProjectId: link.platformProjectId,
    sequenceName: link.sequenceName || null,
    exportId: link.exportId || null,
    openedAt: link.openedAt || new Date().toISOString(),
  }
  writeCutLinks(map)
  return map[key]
}

export function getCutSequenceLink(platformProjectId, cutId) {
  if (!platformProjectId || !cutId) return null
  const map = readCutLinks()
  return map[`${platformProjectId}:${cutId}`] || null
}
