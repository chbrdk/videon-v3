import { apiError, apiJson } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import { finalizeMediaUploaded, findMediaAsset, findMediaByChecksumInWorkspace } from '@/lib/db/media'
import { objectStorageConfig } from '@/lib/runtime-config'
import { requireSessionUserId } from '@/lib/session-user'
import { S3ObjectStore } from '@/lib/storage/s3-object-store'
import { resolveAccessibleWorkspace } from '@/lib/workspace-access'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ mediaAssetId: string }> }

export async function POST(request: Request, context: RouteContext) {
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

  const { mediaAssetId } = await context.params
  const media = await findMediaAsset(mediaAssetId.trim())
  if (!media) return apiError(request, 404, 'not_found', 'Media asset not found')

  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const platformProjectId =
    body && typeof body === 'object' && !Array.isArray(body) && typeof (body as { platformProjectId?: unknown }).platformProjectId === 'string'
      ? (body as { platformProjectId: string }).platformProjectId.trim()
      : ''

  if (!platformProjectId) {
    return apiError(request, 400, 'invalid_payload', 'platformProjectId is required')
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

  const store = new S3ObjectStore()
  try {
    const checksumSha256 = await store.hashStoredObject({
      workspaceId: resolved.workspace.id,
      storageKey: media.storageKey,
      expectedBytes: media.bytes,
    })

    const duplicate = await findMediaByChecksumInWorkspace(
      resolved.workspace.id,
      checksumSha256,
      media.id,
    )
    if (duplicate) {
      await store.removeObject({ workspaceId: resolved.workspace.id, storageKey: media.storageKey })
      return apiError(request, 409, 'invalid_payload', 'An asset with this checksum already exists in the Collection')
    }

    const updated = await finalizeMediaUploaded({
      mediaAssetId: media.id,
      workspaceId: resolved.workspace.id,
      checksumSha256,
    })
    if (!updated) {
      return apiError(request, 409, 'invalid_payload', 'Media is not in an uploading state')
    }

    const { scheduleMediaAnalysis } = await import('@/lib/pipeline/enqueue')
    const scheduled = await scheduleMediaAnalysis({
      mediaAssetId: updated.id,
      workspaceId: resolved.workspace.id,
      requestedByPlexonUserId: userId,
      checksumSha256: updated.checksumSha256,
    })

    return apiJson(request, { media: updated, analysis: scheduled })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload verification failed'
    if (message.includes('does not match declared')) {
      return apiError(request, 422, 'invalid_payload', 'Uploaded file size does not match the declared size')
    }
    if (message.includes('NotFound') || message.includes('NoSuchKey') || message.includes('missing')) {
      return apiError(request, 422, 'invalid_payload', 'Uploaded object was not found in storage')
    }
    if (message.includes('duplicate') || message.includes('unique')) {
      await store.removeObject({ workspaceId: resolved.workspace.id, storageKey: media.storageKey }).catch(() => {})
      return apiError(request, 409, 'invalid_payload', 'An asset with this checksum already exists in the Collection')
    }
    return apiError(request, 503, 'dependency_unavailable', message, { retryable: true })
  }
}
