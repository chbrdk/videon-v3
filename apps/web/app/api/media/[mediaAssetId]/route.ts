import { apiError, apiJson } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import { deleteMediaAssetForWorkspace } from '@/lib/db/media'
import {
  findLatestAnalysisForMedia,
  listSceneInsightsForAnalysis,
  listStagesForAnalysis,
} from '@/lib/db/analysis'
import { objectStorageConfig } from '@/lib/runtime-config'
import { resolveMediaInWorkspace, resolveWorkspaceForMediaRequest } from '@/lib/media-access'
import { requireSessionUserId } from '@/lib/session-user'
import { findLatestTranscriptForMedia } from '@/lib/db/transcript'
import { S3ObjectStore } from '@/lib/storage/s3-object-store'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ mediaAssetId: string }> }

function platformProjectIdFrom(request: Request): string {
  return new URL(request.url).searchParams.get('platformProjectId')?.trim() || ''
}

export async function GET(request: Request, context: RouteContext) {
  const userId = await requireSessionUserId()
  if (!userId) return apiError(request, 401, 'service_unauthorized', 'Authentication required')
  if (!hasDatabaseConfig()) {
    return apiError(request, 503, 'dependency_unavailable', 'Workspace persistence is unavailable', {
      retryable: true,
    })
  }

  const platformProjectId = platformProjectIdFrom(request)
  if (!platformProjectId) {
    return apiError(request, 400, 'invalid_payload', 'platformProjectId is required')
  }

  const { mediaAssetId } = await context.params
  const resolved = await resolveMediaInWorkspace({
    plexonUserId: userId,
    platformProjectId,
    mediaAssetId,
    detailed: true,
  })
  if (!resolved.ok) {
    const status =
      resolved.code === 'collection_access_denied' ? 403 : resolved.code === 'not_found' ? 404 : 503
    return apiError(request, status, resolved.code, 'Media asset unavailable', {
      retryable: resolved.code === 'dependency_unavailable',
    })
  }

  const analysis = await findLatestAnalysisForMedia(resolved.media.id)
  const stages = analysis ? await listStagesForAnalysis(analysis.id) : []
  const scenes = analysis ? await listSceneInsightsForAnalysis(analysis.id) : []
  const transcript = await findLatestTranscriptForMedia(resolved.media.id)

  return apiJson(request, {
    media: resolved.media,
    analysis,
    stages,
    scenes,
    transcript,
  })
}

export async function DELETE(request: Request, context: RouteContext) {
  const userId = await requireSessionUserId()
  if (!userId) return apiError(request, 401, 'service_unauthorized', 'Authentication required')
  if (!hasDatabaseConfig()) {
    return apiError(request, 503, 'dependency_unavailable', 'Workspace persistence is unavailable', {
      retryable: true,
    })
  }

  const platformProjectId = platformProjectIdFrom(request)
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

  const { mediaAssetId } = await context.params
  const deleted = await deleteMediaAssetForWorkspace(mediaAssetId.trim(), workspace.workspace.id)
  if (!deleted) {
    return apiError(request, 404, 'not_found', 'Media asset not found')
  }

  if (objectStorageConfig()) {
    const store = new S3ObjectStore()
    await store.removeObject({
      workspaceId: workspace.workspace.id,
      storageKey: deleted.storageKey,
    }).catch(() => {})
  }

  return apiJson(request, { deleted: true, mediaAssetId: mediaAssetId.trim() })
}
