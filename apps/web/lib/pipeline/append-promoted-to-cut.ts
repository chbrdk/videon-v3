import { addScenesToCut, findCut } from '@/lib/db/cuts'
import { findMediaAssetDetail } from '@/lib/db/media'
import { markMediaGenerationCutInserted } from '@/lib/db/media-generation'

/**
 * Append a promoted generation asset as a V1 scene on a Cut.
 * Spec: specs/api/media-generative-edit.md · promote / target_cut_id
 */
export async function appendPromotedGenerationToCut(input: {
  cutId: string
  workspaceId: string
  promotedMediaAssetId: string
  fallbackDurationMs: number
  jobId?: string
  markInserted?: boolean
}): Promise<{ sceneIds: string[] } | { error: string }> {
  const cut = await findCut(input.cutId)
  if (!cut || cut.workspaceId !== input.workspaceId) {
    return { error: 'Cut not found' }
  }
  const promoted = await findMediaAssetDetail(input.promotedMediaAssetId)
  const durationMs =
    promoted?.durationMs && promoted.durationMs > 0
      ? promoted.durationMs
      : Math.max(1000, Math.floor(input.fallbackDurationMs))
  const scenes = await addScenesToCut({
    cutId: input.cutId,
    scenes: [
      {
        mediaAssetId: input.promotedMediaAssetId,
        startMs: 0,
        endMs: durationMs,
      },
    ],
  })
  if (!scenes?.length) {
    return { error: 'Could not append scene to Cut' }
  }
  if (input.markInserted && input.jobId) {
    await markMediaGenerationCutInserted(input.jobId)
  }
  return { sceneIds: scenes.map((scene) => scene.id) }
}
