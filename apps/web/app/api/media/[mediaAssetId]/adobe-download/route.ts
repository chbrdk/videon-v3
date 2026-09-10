import { NextResponse } from 'next/server'
import { apiError, apiJson } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import { resolveMediaInWorkspace } from '@/lib/media-access'
import { objectStorageConfig } from '@/lib/runtime-config'
import { requireSessionUserId } from '@/lib/session-user'
import { resolveMediaSourceStorageKey } from '@/lib/storage/resolve-media-source'
import { S3ObjectStore } from '@/lib/storage/s3-object-store'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ mediaAssetId: string }> }

/**
 * Short-lived Adobe panel download (source Wave 1).
 * Spec: specs/api/media-adobe-download.md
 */
export async function GET(request: Request, context: RouteContext) {
  const userId = await requireSessionUserId()
  if (!userId) return apiError(request, 401, 'service_unauthorized', 'Authentication required')
  if (!hasDatabaseConfig()) {
    return apiError(request, 503, 'dependency_unavailable', 'Workspace persistence is unavailable', {
      retryable: true,
    })
  }
  if (!objectStorageConfig()) {
    return apiError(request, 503, 'dependency_unavailable', 'Object storage is unavailable', {
      retryable: true,
    })
  }

  const url = new URL(request.url)
  const platformProjectId = url.searchParams.get('platformProjectId')?.trim() || ''
  if (!platformProjectId) {
    return apiError(request, 400, 'invalid_payload', 'platformProjectId is required')
  }

  const kindRaw = (url.searchParams.get('kind')?.trim() || 'source').toLowerCase()
  if (kindRaw !== 'source' && kindRaw !== 'proxy') {
    return apiError(request, 400, 'invalid_payload', 'kind must be source or proxy')
  }
  const kind = kindRaw as 'source' | 'proxy'

  const modeRaw = (url.searchParams.get('mode')?.trim() || 'json').toLowerCase()
  if (modeRaw !== 'json' && modeRaw !== 'redirect') {
    return apiError(request, 400, 'invalid_payload', 'mode must be json or redirect')
  }
  const mode = modeRaw as 'json' | 'redirect'

  if (kind === 'proxy') {
    return apiError(request, 409, 'proxy_unavailable', 'Edit proxy derivatives are not available yet', {
      retryable: false,
    })
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
  const storageKey = await resolveMediaSourceStorageKey({
    store,
    workspaceId: resolved.workspace.id,
    mediaAssetId: resolved.media.id,
    storageKey: resolved.media.storageKey,
  })
  if (!storageKey) {
    return apiError(
      request,
      404,
      'not_found',
      'Source media file missing in storage. Re-upload this media in the Collection library.',
    )
  }

  const target = await store.createDownloadTarget({
    workspaceId: resolved.workspace.id,
    storageKey,
    mediaAssetId: resolved.media.id,
    filename: resolved.media.originalFilename,
    disposition: 'attachment',
  })

  const cacheKey = `${resolved.media.id}:source:${resolved.media.checksumSha256}`

  if (mode === 'redirect') {
    return NextResponse.redirect(target.uploadUrl, 302)
  }

  return apiJson(request, {
    mediaAssetId: resolved.media.id,
    platformProjectId,
    kind: 'source' as const,
    filename: resolved.media.originalFilename,
    mimeType: resolved.media.mimeType,
    bytes: resolved.media.bytes,
    checksumSha256: resolved.media.checksumSha256,
    downloadUrl: target.uploadUrl,
    expiresAt: target.expiresAt,
    cacheKey,
  })
}
