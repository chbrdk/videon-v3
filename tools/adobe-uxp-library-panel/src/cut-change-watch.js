/**
 * Cut → Premiere change watch (Wave P5) — paused in provider-first UI.
 * Observe Cut `updatedAt` vs last synced stamp — does not mutate by itself.
 * Spec: adobe-uxp-cut-pushback-premiere.md § Wave P5
 * Strategy: knowledge/adobe-uxp-provider-first.md
 */

/** Quiet listCuts interval while Cuts mode is active. */
export const CUT_CHANGE_WATCH_INTERVAL_MS = 8000

export function parseIsoMs(iso) {
  if (!iso) return null
  const t = Date.parse(String(iso))
  return Number.isFinite(t) ? t : null
}

/**
 * True when Cut is newer than the last Premiere sync stamp for that link.
 * @param {string|null|undefined} cutUpdatedAt
 * @param {string|null|undefined} syncedUpdatedAt — from cut-link-store
 * @param {string|null|undefined} [openedAt] — fallback baseline if synced missing
 */
export function isCutStaleVsLink(cutUpdatedAt, syncedUpdatedAt, openedAt = null) {
  const cutMs = parseIsoMs(cutUpdatedAt)
  if (cutMs == null) return false
  const baselineMs = parseIsoMs(syncedUpdatedAt) ?? parseIsoMs(openedAt)
  if (baselineMs == null) return false
  return cutMs > baselineMs
}

/**
 * @param {Array<{ id: string, name?: string, updatedAt?: string|null }>} cuts
 * @param {(cutId: string) => { syncedUpdatedAt?: string|null, openedAt?: string|null }|null} getLink
 * @returns {Array<{ cut: object, link: object }>}
 */
export function findStaleLinkedCuts(cuts, getLink) {
  const list = Array.isArray(cuts) ? cuts : []
  const out = []
  for (const cut of list) {
    if (!cut?.id) continue
    const link = typeof getLink === 'function' ? getLink(cut.id) : null
    if (!link) continue
    if (isCutStaleVsLink(cut.updatedAt, link.syncedUpdatedAt, link.openedAt)) {
      out.push({ cut, link })
    }
  }
  return out
}

export function formatStaleCutsBanner(staleRows, { autoPatch = false } = {}) {
  const n = staleRows?.length || 0
  if (!n) return null
  const names = staleRows
    .slice(0, 3)
    .map((row) => row.cut?.name || row.cut?.id || 'Cut')
    .join(', ')
  const more = n > 3 ? ` (+${n - 3})` : ''
  if (autoPatch) {
    return `${n} Cut(s) geändert — Auto-Patch… (${names}${more})`
  }
  return `${n} Cut(s) in Videon neuer als Premiere (${names}${more}). „Cut neu laden“ wenn die Sequenz ersetzt werden soll.`
}
