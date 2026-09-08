/**
 * Canonical scene search hit shape + label helpers.
 * Spec: specs/domain/scene-hit-model.md
 * Shared semantics with Plexon `video_hit_strip` / build-videon-media-search-ui.
 */

export type SceneHitModel = {
  id: string
  mediaAssetId: string
  platformProjectId: string
  sceneKey: string | null
  mediaFilename: string
  startMs: number | null
  endMs: number | null
  searchText: string
  projectName?: string | null
  href?: string
}

/** Product chat strip alias — same canonical shape. */
export type SceneSearchHitModel = SceneHitModel

/** Seek ms for posters / preview (defaults to 1000 when unknown). */
export function sceneHitAtMs(hit: Pick<SceneHitModel, 'startMs' | 'endMs'>): number {
  if (hit.startMs != null && hit.startMs >= 0) return hit.startMs
  if (hit.endMs != null) return Math.max(0, Math.floor(hit.endMs / 2))
  return 1000
}

/** MM:SS clock for hit labels (aligned with assistant strip). */
export function formatSceneHitClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function sceneHitTimingLabel(
  hit: Pick<SceneHitModel, 'startMs' | 'endMs'>,
): string | null {
  if (hit.startMs != null && hit.endMs != null) {
    return `${formatSceneHitClock(hit.startMs)}–${formatSceneHitClock(hit.endMs)}`
  }
  if (hit.startMs != null) return formatSceneHitClock(hit.startMs)
  return null
}

export function sceneHitDurationLabel(
  hit: Pick<SceneHitModel, 'startMs' | 'endMs'>,
): string | null {
  if (hit.startMs == null || hit.endMs == null || hit.endMs < hit.startMs) return null
  return formatSceneHitClock(hit.endMs - hit.startMs)
}

export function sceneHitOrdinalLabel(
  hit: Pick<SceneHitModel, 'sceneKey'>,
  index: number,
  formatN: (n: number) => string = (n) => `Szene ${n}`,
): string {
  const raw = hit.sceneKey?.trim()
  if (raw) {
    const match = raw.match(/(\d+)/)
    if (match) return formatN(Number(match[1]))
    return raw
  }
  return formatN(index + 1)
}

export function buildSceneHitHref(input: {
  mediaAssetId: string
  platformProjectId: string
  startMs?: number | null
  sceneKey?: string | null
}): string {
  const params = new URLSearchParams({
    platformProjectId: input.platformProjectId,
  })
  if (input.startMs != null && input.startMs >= 0) {
    params.set('t', String(Math.floor(input.startMs)))
  }
  const scene = input.sceneKey?.trim()
  if (scene) params.set('scene', scene)
  return `/media/${encodeURIComponent(input.mediaAssetId)}?${params.toString()}`
}

export function mapSearchApiHitToSceneHit(
  row: {
    id?: string
    mediaAssetId?: string
    platformProjectId?: string
    sceneKey?: string | null
    mediaFilename?: string
    startMs?: number | null
    endMs?: number | null
    searchText?: string
    projectName?: string | null
  },
  index: number,
): SceneHitModel | null {
  const mediaAssetId = row.mediaAssetId?.trim() ?? ''
  const platformProjectId = row.platformProjectId?.trim() ?? ''
  if (!mediaAssetId || !platformProjectId) return null
  return {
    id: (row.id?.trim() || `${mediaAssetId}-${index}`).slice(0, 256),
    mediaAssetId,
    platformProjectId,
    sceneKey: row.sceneKey?.trim() || null,
    mediaFilename: (row.mediaFilename?.trim() || mediaAssetId).slice(0, 256),
    startMs: typeof row.startMs === 'number' ? row.startMs : null,
    endMs: typeof row.endMs === 'number' ? row.endMs : null,
    searchText: (row.searchText ?? '').slice(0, 200),
    projectName: row.projectName?.trim() || null,
    href: buildSceneHitHref({
      mediaAssetId,
      platformProjectId,
      startMs: typeof row.startMs === 'number' ? row.startMs : null,
      sceneKey: row.sceneKey,
    }),
  }
}
