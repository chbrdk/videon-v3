import { apiError, apiJson } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import { objectStorageConfig } from '@/lib/runtime-config'
import { resolveMediaInWorkspace } from '@/lib/media-access'
import { requireSessionUserId } from '@/lib/session-user'
import { S3ObjectStore } from '@/lib/storage/s3-object-store'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ mediaAssetId: string }> }

export async function GET(request: Request, context: RouteContext) {
  const userId = await requireSessionUserId()
  if (!userId) return apiError(request, 401, 'service_unauthorized', 'Authentication required')
  if (!hasDatabaseConfig()) {
    return apiError(request, 503, 'dependency_unavailable', 'Workspace persistence is unavailable', {
      retryable: true,
    })
  }
  if (!objectStorageConfig()) {
    return apiError(request, 503, 'dependency_unavailable', 'Object storage is unavailable', { retryable: true })
  }

  const platformProjectId = new URL(request.url).searchParams.get('platformProjectId')?.trim() || ''
  if (!platformProjectId) {
    return apiError(request, 400, 'invalid_payload', 'platformProjectId is required')
  }

  const { mediaAssetId } = await context.params
  const resolved = await resolveMediaInWorkspace({
    plexonUserId: userId,
    platformProjectId,
    mediaAssetId,
  })
  if (!resolved.ok) {
    const status =
      resolved.code === 'collection_access_denied' ? 403 : resolved.code === 'not_found' ? 404 : 503
    return apiError(request, status, resolved.code, 'Media asset unavailable', {
      retryable: resolved.code === 'dependency_unavailable',
    })
  }

  if (resolved.media.lifecycleState === 'uploading') {
    return apiError(request, 409, 'invalid_payload', 'Upload is not complete yet')
  }

  const store = new S3ObjectStore()
  const target = await store.createDownloadTarget({
    workspaceId: resolved.workspace.id,
    storageKey: resolved.media.storageKey,
    mediaAssetId: resolved.media.id,
    filename: resolved.media.originalFilename,
    disposition: 'inline',
  })

  return apiJson(request, {
    playbackUrl: target.uploadUrl,
    expiresAt: target.expiresAt,
    mimeType: resolved.media.mimeType,
  })
}
