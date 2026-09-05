import { apiError, apiJson } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import { findMediaAsset } from '@/lib/db/media'
import { paths } from '@/lib/paths'
import { objectStorageConfig } from '@/lib/runtime-config'
import { requireSessionUserId } from '@/lib/session-user'
import { S3ObjectStore } from '@/lib/storage/s3-object-store'
import { resolveAccessibleWorkspace } from '@/lib/workspace-access'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UPLOAD_TTL_MS = 15 * 60 * 1000

type RouteContext = { params: Promise<{ mediaAssetId: string }> }

export async function PUT(request: Request, context: RouteContext) {
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

  const url = new URL(request.url)
  const platformProjectId = url.searchParams.get('platformProjectId')?.trim() ?? ''
  if (!platformProjectId) {
    return apiError(request, 400, 'invalid_payload', 'platformProjectId is required')
  }

  const { mediaAssetId } = await context.params
  const media = await findMediaAsset(mediaAssetId.trim())
  if (!media) return apiError(request, 404, 'not_found', 'Media asset not found')
  if (media.lifecycleState !== 'uploading') {
    return apiError(request, 409, 'invalid_payload', 'Media is not awaiting upload')
  }
  if (Date.now() - new Date(media.createdAt).getTime() > UPLOAD_TTL_MS) {
    return apiError(request, 410, 'invalid_payload', 'Upload window expired — request a new upload intent')
  }

  const resolved = await resolveAccessibleWorkspace({ plexonUserId: userId, platformProjectId })
  if (!resolved.ok) {
    const status = resolved.code === 'collection_access_denied' ? 403 : resolved.code === 'not_found' ? 404 : 503
    return apiError(request, status, resolved.code, 'Collection workspace unavailable')
  }
  if (resolved.workspace.id !== media.workspaceId) {
    return apiError(request, 403, 'collection_access_denied', 'Media does not belong to this Collection')
  }
  if (resolved.workspace.status === 'archived') {
    return apiError(request, 403, 'collection_access_denied', 'Archived Collections are read-only')
  }

  const contentLengthHeader = request.headers.get('content-length')
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : Number.NaN
  if (!Number.isSafeInteger(contentLength) || contentLength !== media.bytes) {
    return apiError(request, 422, 'invalid_payload', 'Content-Length must match the declared upload size')
  }

  const contentType = request.headers.get('content-type')?.split(';')[0]?.trim() ?? ''
  if (contentType && contentType !== media.mimeType) {
    return apiError(request, 422, 'invalid_payload', 'Content-Type must match the declared mime type')
  }

  const store = new S3ObjectStore()
  try {
    await store.putObjectFromBody({
      workspaceId: resolved.workspace.id,
      storageKey: media.storageKey,
      mimeType: media.mimeType,
      bytes: media.bytes,
      body: request.body,
    })
    return apiJson(request, { ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload proxy failed'
    return apiError(request, 503, 'dependency_unavailable', message, { retryable: true })
  }
}
