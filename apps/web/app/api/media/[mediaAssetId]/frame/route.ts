import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { apiError } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import { resolveMediaInWorkspace } from '@/lib/media-access'
import { extractFrameJpegBytes } from '@/lib/pipeline/frame-sample'
import { objectStorageConfig } from '@/lib/runtime-config'
import { requireSessionUserId } from '@/lib/session-user'
import { S3ObjectStore } from '@/lib/storage/s3-object-store'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ mediaAssetId: string }> }

function parseTimestampMs(raw: string | null): number {
  if (raw == null || raw.trim() === '') return 1000
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return 1000
  return Math.floor(n)
}

/**
 * GET /api/media/:id/frame — single JPEG still for assistant posters.
 * Spec: specs/api/media-frame.md
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
    return apiError(request, 503, 'dependency_unavailable', 'Object storage is unavailable', { retryable: true })
  }

  const url = new URL(request.url)
  const platformProjectId = url.searchParams.get('platformProjectId')?.trim() || ''
  if (!platformProjectId) {
    return apiError(request, 400, 'invalid_payload', 'platformProjectId is required')
  }
  const atMs = parseTimestampMs(url.searchParams.get('t'))

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

  const tempPath = join(tmpdir(), `videon-frame-src-${randomUUID()}`)
  try {
    const store = new S3ObjectStore()
    await store.downloadObjectToFile({
      workspaceId: resolved.workspace.id,
      storageKey: resolved.media.storageKey,
      destinationPath: tempPath,
    })
    const jpeg = await extractFrameJpegBytes(tempPath, atMs, { maxWidth: 480 })
    if (!jpeg) {
      return apiError(request, 503, 'dependency_unavailable', 'Frame extraction failed', {
        retryable: true,
      })
    }
    return new Response(new Uint8Array(jpeg), {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, max-age=300',
        'Content-Length': String(jpeg.byteLength),
      },
    })
  } catch {
    return apiError(request, 503, 'dependency_unavailable', 'Frame extraction unavailable', {
      retryable: true,
    })
  } finally {
    await unlink(tempPath).catch(() => {})
  }
}
