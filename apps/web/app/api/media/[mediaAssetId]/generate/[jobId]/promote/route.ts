import { apiError, apiJson } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import { findMediaGenerationJob } from '@/lib/db/media-generation'
import { resolveMediaInWorkspace, resolveWorkspaceForMediaRequest } from '@/lib/media-access'
import { appendPromotedGenerationToCut } from '@/lib/pipeline/append-promoted-to-cut'
import { paths } from '@/lib/paths'
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

  const platformProjectId = new URL(request.url).searchParams.get('platformProjectId')?.trim() || ''
  if (!platformProjectId) {
    return apiError(request, 400, 'invalid_payload', 'platformProjectId is required')
  }

  const workspace = await resolveWorkspaceForMediaRequest({
    plexonUserId: userId,
    platformProjectId,
    writable: true,
  })
  if (!workspace.ok) {
    const status =
      workspace.code === 'collection_access_denied' ? 403 : workspace.code === 'not_found' ? 404 : 503
    return apiError(request, status, workspace.code, 'Collection workspace unavailable', {
      retryable: workspace.code === 'dependency_unavailable',
    })
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

  const job = await findMediaGenerationJob(jobId.trim())
  if (!job || job.mediaAssetId !== resolved.media.id || job.workspaceId !== resolved.media.workspaceId) {
    return apiError(request, 404, 'not_found', 'Generation job not found')
  }
  if (job.status !== 'succeeded' || !job.promotedMediaAssetId) {
    return apiError(request, 409, 'invalid_payload', `Job is ${job.status}; promote requires succeeded + asset`, {
      retryable: job.status === 'queued' || job.status === 'running' || job.status === 'draft_ready',
    })
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    body = {}
  }

  const cutId =
    (typeof body.cutId === 'string' && body.cutId.trim()) ||
    (!job.targetCutInsertedAt && job.targetCutId ? job.targetCutId : '') ||
    ''

  let cutSceneIds: string[] | null = null
  if (cutId) {
    const fallbackDurationMs =
      job.startMs != null && job.endMs != null
        ? Math.max(1000, job.endMs - job.startMs)
        : (job.durationSeconds ?? 5) * 1000
    const inserted = await appendPromotedGenerationToCut({
      cutId,
      workspaceId: workspace.workspace.id,
      promotedMediaAssetId: job.promotedMediaAssetId,
      fallbackDurationMs,
      jobId: job.id,
      markInserted: true,
    })
    if ('error' in inserted) {
      return apiError(request, 404, 'not_found', inserted.error)
    }
    cutSceneIds = inserted.sceneIds
  }

  return apiJson(request, {
    job,
    promotedMediaAssetId: job.promotedMediaAssetId,
    deepLink: paths.routes.mediaFor(job.promotedMediaAssetId, platformProjectId),
    cutSceneIds,
  })
}
