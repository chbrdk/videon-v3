import { apiError, apiJson } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import { findMediaAsset } from '@/lib/db/media'
import { findMediaMultipartUpload, upsertMediaMultipartPart } from '@/lib/db/media-multipart'
import { objectStorageConfig } from '@/lib/runtime-config'
import { requireSessionUserId } from '@/lib/session-user'
import { MULTIPART_PART_SIZE_BYTES, S3ObjectStore } from '@/lib/storage/s3-object-store'
import { resolveAccessibleWorkspace } from '@/lib/workspace-access'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 600

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
  const partNumber = Number(url.searchParams.get('partNumber'))
  if (!platformProjectId) {
    return apiError(request, 400, 'invalid_payload', 'platformProjectId is required')
  }
  if (!Number.isInteger(partNumber) || partNumber < 1) {
    return apiError(request, 400, 'invalid_payload', 'partNumber must be a positive integer')
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

  const multipart = await findMediaMultipartUpload(media.id)
  if (!multipart) {
    return apiError(request, 409, 'invalid_payload', 'No multipart upload session for this media')
  }

  const resolved = await resolveAccessibleWorkspace({ plexonUserId: userId, platformProjectId })
  if (!resolved.ok) {
    const status = resolved.code === 'collection_access_denied' ? 403 : resolved.code === 'not_found' ? 404 : 503
    return apiError(request, status, resolved.code, 'Collection workspace unavailable')
  }
  if (resolved.workspace.id !== media.workspaceId || resolved.workspace.id !== multipart.workspaceId) {
    return apiError(request, 403, 'collection_access_denied', 'Media does not belong to this Collection')
  }
  if (resolved.workspace.status === 'archived') {
    return apiError(request, 403, 'collection_access_denied', 'Archived Collections are read-only')
  }

  const contentLengthHeader = request.headers.get('content-length')
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : Number.NaN
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
    return apiError(request, 422, 'invalid_payload', 'Content-Length is required for each part')
  }
  const expectedParts = Math.ceil(media.bytes / MULTIPART_PART_SIZE_BYTES)
  if (partNumber > expectedParts) {
    return apiError(request, 422, 'invalid_payload', `partNumber exceeds expected ${expectedParts} parts`)
  }
  const isLastPart = partNumber === expectedParts
  const expectedPartBytes = isLastPart
    ? media.bytes - (expectedParts - 1) * MULTIPART_PART_SIZE_BYTES
    : MULTIPART_PART_SIZE_BYTES
  if (contentLength !== expectedPartBytes) {
    return apiError(
      request,
      422,
      'invalid_payload',
      `Part ${partNumber} must be exactly ${expectedPartBytes} bytes`,
    )
  }

  const store = new S3ObjectStore()
  try {
    const { etag } = await store.uploadMultipartPart({
      workspaceId: resolved.workspace.id,
      storageKey: media.storageKey,
      uploadId: multipart.s3UploadId,
      partNumber,
      bytes: contentLength,
      body: request.body,
    })
    await upsertMediaMultipartPart({ mediaAssetId: media.id, partNumber, etag })
    return apiJson(request, { ok: true, partNumber, etag })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload part failed'
    return apiError(request, 503, 'dependency_unavailable', message, { retryable: true })
  }
}
