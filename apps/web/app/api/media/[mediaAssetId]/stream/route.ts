import { apiError } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import { objectStorageConfig } from '@/lib/runtime-config'
import { resolveMediaInWorkspace } from '@/lib/media-access'
import { requireSessionUserId } from '@/lib/session-user'
import { S3ObjectStore } from '@/lib/storage/s3-object-store'
import { Readable } from 'node:stream'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ mediaAssetId: string }> }

function contentDisposition(filename: string): string {
  const clean = filename.replace(/[\r\n"\\]/g, '_').slice(0, 180) || 'video'
  return `inline; filename="${clean}"`
}

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

  const range = request.headers.get('range')
  const store = new S3ObjectStore()
  const object = await store.openObjectStream({
    workspaceId: resolved.workspace.id,
    storageKey: resolved.media.storageKey,
    range,
  })

  const headers = new Headers({
    'Content-Type': object.contentType ?? resolved.media.mimeType ?? 'application/octet-stream',
    'Content-Disposition': contentDisposition(resolved.media.originalFilename),
    'Accept-Ranges': object.acceptRanges ?? 'bytes',
    'Cache-Control': 'private, max-age=60',
  })
  if (object.contentLength !== undefined) headers.set('Content-Length', String(object.contentLength))
  if (object.contentRange) headers.set('Content-Range', object.contentRange)

  return new Response(Readable.toWeb(object.body) as ReadableStream, {
    status: object.statusCode,
    headers,
  })
}
