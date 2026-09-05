import { markMediaProcessing } from '@/lib/db/media-lifecycle'
import { createAnalysisRunForMedia } from '@/lib/db/analysis'
import { enqueueMediaAnalysisJob, pipelineQueueConfigured } from '@/lib/jobs/pg-boss-queue'

export async function scheduleMediaAnalysis(input: {
  mediaAssetId: string
  workspaceId: string
  requestedByPlexonUserId: string
  checksumSha256: string
}): Promise<{ analysisRunId: string; queued: boolean }> {
  const analysis = await createAnalysisRunForMedia({
    mediaAssetId: input.mediaAssetId,
    requestedByPlexonUserId: input.requestedByPlexonUserId,
    checksumSha256: input.checksumSha256,
  })

  if (!pipelineQueueConfigured()) {
    return { analysisRunId: analysis.id, queued: false }
  }

  await markMediaProcessing(input.mediaAssetId, input.workspaceId)
  const jobId = await enqueueMediaAnalysisJob({
    analysisRunId: analysis.id,
    mediaAssetId: input.mediaAssetId,
  })
  return { analysisRunId: analysis.id, queued: Boolean(jobId) }
}
