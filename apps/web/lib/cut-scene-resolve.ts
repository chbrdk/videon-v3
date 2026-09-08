import { findLatestAnalysisForMedia, listSceneInsightsForAnalysis } from '@/lib/db/analysis'

export type ResolvedCutSceneInput = {
  mediaAssetId: string
  startMs: number
  endMs: number
  sceneKey: string | null
}

/**
 * Resolve POST/PATCH scene entries: require mediaAssetId; times explicit or via sceneKey
 * from the latest analysis run for that media.
 */
export async function resolveCutSceneInputs(
  raw: unknown[],
): Promise<{ ok: true; scenes: ResolvedCutSceneInput[] } | { ok: false; message: string }> {
  const scenes: ResolvedCutSceneInput[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const scene = entry as Record<string, unknown>
    const mediaAssetId = typeof scene.mediaAssetId === 'string' ? scene.mediaAssetId.trim() : ''
    if (!mediaAssetId) {
      return { ok: false, message: 'scenes[].mediaAssetId is required' }
    }
    const sceneKey =
      typeof scene.sceneKey === 'string' && scene.sceneKey.trim() ? scene.sceneKey.trim() : null
    let startMs =
      typeof scene.startMs === 'number' && Number.isFinite(scene.startMs)
        ? Math.max(0, Math.floor(scene.startMs))
        : null
    let endMs =
      typeof scene.endMs === 'number' && Number.isFinite(scene.endMs)
        ? Math.max(0, Math.floor(scene.endMs))
        : null

    if ((startMs === null || endMs === null || endMs <= startMs) && sceneKey) {
      const analysis = await findLatestAnalysisForMedia(mediaAssetId)
      if (!analysis || analysis.status !== 'succeeded') {
        return { ok: false, message: `No succeeded analysis to resolve sceneKey for ${mediaAssetId}` }
      }
      const insights = await listSceneInsightsForAnalysis(analysis.id)
      const hit = insights.find((row) => row.sceneKey === sceneKey)
      if (!hit) {
        return { ok: false, message: `sceneKey not found: ${sceneKey}` }
      }
      startMs = hit.startMs
      endMs = hit.endMs
    }

    if (startMs === null || endMs === null || endMs <= startMs) {
      return { ok: false, message: 'scenes[] require startMs/endMs or resolvable sceneKey' }
    }
    scenes.push({ mediaAssetId, startMs, endMs, sceneKey })
  }
  if (!scenes.length) {
    return { ok: false, message: 'scenes must contain at least one valid entry' }
  }
  return { ok: true, scenes }
}
