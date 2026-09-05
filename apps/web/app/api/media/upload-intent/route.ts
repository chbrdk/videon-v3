import { apiError, apiJson } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import { createUploadingMediaAsset } from '@/lib/db/media'
import { paths } from '@/lib/paths'
import { objectStorageConfig } from '@/lib/runtime-config'
import { requireSessionUserId } from '@/lib/session-user'
import { mediaSourceStorageKey } from '@/lib/storage/object-store'
import { pendingChecksumForMedia } from '@/lib/storage/pending-checksum'
import { resolveAccessibleWorkspace } from '@/lib/workspace-access'
import { randomUUID } from 'node:crypto'

export const dynamic = 'force-dynamic'

const UPLOAD_TTL_MS = 15 * 60 * 1000

export async function POST(request: Request) {
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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError(request, 400, 'invalid_payload', 'JSON body required')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return apiError(request, 422, 'invalid_payload', 'Invalid upload intent')
  }

  const record = body as Record<string, unknown>
  const platformProjectId =
    typeof record.platformProjectId === 'string' ? record.platformProjectId.trim() : ''
  const originalFilename =
    typeof record.originalFilename === 'string' ? record.originalFilename.trim() : ''
  const mimeType = typeof record.mimeType === 'string' ? record.mimeType.trim() : ''
  const bytes = typeof record.bytes === 'number' ? record.bytes : Number.NaN

  if (!platformProjectId || !originalFilename || !mimeType) {
    return apiError(request, 422, 'invalid_payload', 'platformProjectId, filename and mimeType are required')
  }
  if (!mimeType.startsWith('video/')) {
    return apiError(request, 422, 'invalid_payload', 'Only video/* uploads are accepted')
  }
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > paths.maxUploadBytes) {
    return apiError(request, 413, 'invalid_payload', 'Upload size is outside the allowed range')
  }

  try {
    const resolved = await resolveAccessibleWorkspace({ plexonUserId: userId, platformProjectId })
    if (!resolved.ok) {
      const status = resolved.code === 'collection_access_denied' ? 403 : resolved.code === 'not_found' ? 404 : 503
      return apiError(request, status, resolved.code, 'Collection workspace unavailable', {
        retryable: resolved.code === 'dependency_unavailable',
      })
    }
    if (resolved.workspace.status === 'archived') {
      return apiError(request, 403, 'collection_access_denied', 'Archived Collections are read-only')
    }

    const mediaAssetId = randomUUID()
    const checksumSha256 = pendingChecksumForMedia(mediaAssetId)
    const storageKey = mediaSourceStorageKey(resolved.workspace.id, mediaAssetId)
    const media = await createUploadingMediaAsset({
      id: mediaAssetId,
      workspace: resolved.workspace,
      plexonUserId: userId,
      originalFilename,
      mimeType,
      bytes,
      checksumSha256,
      storageKey,
    })

    return apiJson(
      request,
      {
        media,
        upload: {
          storageKey,
          uploadUrl: paths.routes.apiMediaUpload(mediaAssetId, platformProjectId),
          headers: { 'content-type': mimeType },
          expiresAt: new Date(Date.now() + UPLOAD_TTL_MS).toISOString(),
        },
      },
      201,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload intent failed'
    if (message.includes('duplicate') || message.includes('unique')) {
      return apiError(request, 409, 'invalid_payload', 'An asset with this checksum already exists in the Collection')
    }
    return apiError(request, 503, 'dependency_unavailable', message, { retryable: true })
  }
}
