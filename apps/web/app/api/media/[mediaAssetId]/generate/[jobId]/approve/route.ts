import { apiError, apiJson } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import { findCut } from '@/lib/db/cuts'
import {
  approveMediaGenerationDraft,
  findMediaGenerationJob,
  setMediaGenerationTargetCut,
} from '@/lib/db/media-generation'
import { enqueueMediaGenerateJob, pipelineQueueConfigured } from '@/lib/jobs/pg-boss-queue'
import { resolveMediaInWorkspace, resolveWorkspaceForMediaRequest } from '@/lib/media-access'
import { requireSessionUserId } from '@/lib/session-user'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ mediaAssetId: string; jobId: string }> }

export async function POST(request: Request, context: RouteContext) {
  const userId = await requireSessionUserId()
  if (!userId) return apiError(request, 401, 'service_unauthorized', 'Authentication required')
  if (!hasDatabaseConfig()) {
    return apiError(request, 503, 'dependency_unavailable', 'Workspace persistence is unavailable', {
      retryable: true,
    })
  }
  if (!pipelineQueueConfigured()) {
    return apiError(request, 503, 'dependency_unavailable', 'Job queue is unavailable', { retryable: true })
  }

  const platformProjectId = new URL(request.url).searchParams.get('platformProjectId')?.trim() || ''
  if (!platformProjectId) {
    return apiError(request, 400, 'invalid_payload', 'platformProjectId is required')
  }

  const { mediaAssetId, jobId } = await context.params
  const resolved = await resolveMediaInWorkspace({
    plexonUserId: userId,
    platformProjectId,
    mediaAssetId,
    writable: true,
  })
  if (!resolved.ok) {
    const status =
      resolved.code === 'collection_access_denied' ? 403 : resolved.code === 'not_found' ? 404 : 503
    return apiError(request, status, resolved.code, 'Media asset unavailable', {
      retryable: resolved.code === 'dependency_unavailable',
    })
  }

  const existing = await findMediaGenerationJob(jobId.trim())
  if (
    !existing ||
    existing.mediaAssetId !== resolved.media.id ||
    existing.workspaceId !== resolved.media.workspaceId
  ) {
    return apiError(request, 404, 'not_found', 'Generation job not found')
  }
  if (existing.status !== 'draft_ready') {
    return apiError(request, 409, 'invalid_payload', `Job is ${existing.status}, expected draft_ready`)
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    body = {}
  }

  const cutIdRaw = typeof body.cutId === 'string' ? body.cutId.trim() : ''
  if (cutIdRaw) {
    const workspace = await resolveWorkspaceForMediaRequest({
      plexonUserId: userId,
      platformProjectId,
      writable: true,
    })
    if (!workspace.ok) {
      return apiError(request, 403, workspace.code, 'Collection workspace unavailable')
    }
    const cut = await findCut(cutIdRaw)
    if (!cut || cut.workspaceId !== workspace.workspace.id) {
      return apiError(request, 404, 'not_found', 'Cut not found')
    }
    await setMediaGenerationTargetCut(existing.id, cut.id)
  }

  const job = await approveMediaGenerationDraft(existing.id)
  if (!job) {
    return apiError(request, 409, 'invalid_payload', 'Could not approve draft')
  }

  await enqueueMediaGenerateJob({
    jobId: job.id,
    mediaAssetId: resolved.media.id,
  })

  return apiJson(request, { job }, 202)
}
