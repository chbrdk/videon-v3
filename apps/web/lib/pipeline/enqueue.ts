import { markMediaProcessing } from '@/lib/db/media-lifecycle'
import {
  createAnalysisRunForMedia,
  createRerunAnalysisForMedia,
  findLatestAnalysisForMedia,
} from '@/lib/db/analysis'
import {
  enqueueBrandComplianceJob,
  enqueueMediaAnalysisJob,
  pipelineQueueConfigured,
} from '@/lib/jobs/pg-boss-queue'

export async function scheduleMediaAnalysisRerun(input: {
  mediaAssetId: string
  workspaceId: string
  requestedByPlexonUserId: string
  checksumSha256: string
  extraCapabilities?: string[]
}): Promise<{ analysisRunId: string; queued: boolean }> {
  const analysis = await createRerunAnalysisForMedia({
    mediaAssetId: input.mediaAssetId,
    requestedByPlexonUserId: input.requestedByPlexonUserId,
    checksumSha256: input.checksumSha256,
    extraCapabilities: input.extraCapabilities,
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

/** Re-run Brandion checks against the latest analysis with scene insights. */
export async function scheduleBrandCompliance(input: {
  mediaAssetId: string
}): Promise<{ analysisRunId: string; queued: boolean }> {
  const analysis = await findLatestAnalysisForMedia(input.mediaAssetId)
  if (!analysis) {
    throw new Error('No analysis run available for brand check')
  }
  if (analysis.status !== 'succeeded') {
    throw new Error('Brand check requires a succeeded analysis')
  }
  if (!pipelineQueueConfigured()) {
    return { analysisRunId: analysis.id, queued: false }
  }
  const jobId = await enqueueBrandComplianceJob({
    analysisRunId: analysis.id,
    mediaAssetId: input.mediaAssetId,
  })
  return { analysisRunId: analysis.id, queued: Boolean(jobId) }
}
