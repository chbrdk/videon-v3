/** Scene hit helpers — mirror apps/web/lib/scene-hit-model.ts (Wave 1 copy). */

export function formatSceneHitClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function sceneHitAtMs(hit) {
  if (hit.startMs != null && hit.startMs >= 0) return hit.startMs
  if (hit.endMs != null) return Math.max(0, Math.floor(hit.endMs / 2))
  return 1000
}

export function sceneHitTimingLabel(hit) {
  if (hit.startMs != null && hit.endMs != null) {
    return `${formatSceneHitClock(hit.startMs)}–${formatSceneHitClock(hit.endMs)}`
  }
  if (hit.startMs != null) return formatSceneHitClock(hit.startMs)
  return null
}

export function sceneHitDurationLabel(hit) {
  if (hit.startMs == null || hit.endMs == null || hit.endMs < hit.startMs) return null
  return formatSceneHitClock(hit.endMs - hit.startMs)
}

export function formatRank(rank) {
  const n = Number(rank)
  if (!Number.isFinite(n) || n <= 0) return null
  return n.toFixed(2)
}

export function buildHitHref(hit) {
  if (!hit?.mediaAssetId || !hit?.platformProjectId) return null
  const params = new URLSearchParams({ platformProjectId: hit.platformProjectId })
  if (hit.startMs != null && hit.startMs >= 0) params.set('t', String(Math.floor(hit.startMs)))
  if (hit.sceneKey?.trim()) params.set('scene', hit.sceneKey.trim())
  return `/media/${encodeURIComponent(hit.mediaAssetId)}?${params.toString()}`
}

export function normalizeSearchHit(raw) {
  const mediaAssetId = String(raw.mediaAssetId || '')
  const platformProjectId = String(raw.platformProjectId || '')
  const startMs = raw.startMs == null ? null : Number(raw.startMs)
  const endMs = raw.endMs == null ? null : Number(raw.endMs)
  const sceneKey = raw.sceneKey == null ? null : String(raw.sceneKey)
  const rank = raw.rank == null ? null : Number(raw.rank)
  const hit = {
    id: String(raw.id || `${mediaAssetId}:${sceneKey || 'asset'}`),
    mediaAssetId,
    platformProjectId,
    sceneKey,
    mediaFilename: String(raw.mediaFilename || raw.filename || 'Untitled'),
    startMs: Number.isFinite(startMs) ? startMs : null,
    endMs: Number.isFinite(endMs) ? endMs : null,
    searchText: String(raw.searchText || '').slice(0, 400),
    projectName: raw.projectName == null ? null : String(raw.projectName),
    rank: Number.isFinite(rank) ? rank : null,
    href: raw.href ? String(raw.href) : null,
  }
  if (!hit.href) hit.href = buildHitHref(hit)
  return hit
}

/** Prefer higher rank; stable by id. */
export function dedupeSearchHits(hits) {
  const byKey = new Map()
  for (const hit of hits) {
    if (!hit?.mediaAssetId) continue
    const key = `${hit.mediaAssetId}::${hit.sceneKey || ''}::${hit.startMs ?? ''}::${hit.endMs ?? ''}`
    const prev = byKey.get(key)
    if (!prev || (hit.rank ?? 0) > (prev.rank ?? 0)) byKey.set(key, hit)
  }
  return [...byKey.values()]
}
