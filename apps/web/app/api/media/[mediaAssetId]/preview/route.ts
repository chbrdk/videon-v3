import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { apiError } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import { resolveMediaInWorkspace } from '@/lib/media-access'
import { extractPreviewMp4Bytes } from '@/lib/pipeline/frame-sample'
import { objectStorageConfig } from '@/lib/runtime-config'
import { requireSessionUserId } from '@/lib/session-user'
import { S3ObjectStore } from '@/lib/storage/s3-object-store'

export const dynamic = 'force-dynamic'

const PREVIEW_DEFAULT_MS = 3000
const PREVIEW_MAX_MS = 3000

type RouteContext = { params: Promise<{ mediaAssetId: string }> }

function parseTimestampMs(raw: string | null): number {
  if (raw == null || raw.trim() === '') return 1000
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return 1000
  return Math.floor(n)
}

function parseDurationMs(raw: string | null): number {
  if (raw == null || raw.trim() === '') return PREVIEW_DEFAULT_MS
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return PREVIEW_DEFAULT_MS
  return Math.min(PREVIEW_MAX_MS, Math.max(1, Math.floor(n)))
}

/**
 * GET /api/media/:id/preview — short muted MP4 for assistant hover.
 * Spec: specs/api/media-preview.md
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
  const durationMs = parseDurationMs(url.searchParams.get('durationMs'))

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

  const tempPath = join(tmpdir(), `videon-preview-src-${randomUUID()}`)
  try {
    const store = new S3ObjectStore()
    await store.downloadObjectToFile({
      workspaceId: resolved.workspace.id,
      storageKey: resolved.media.storageKey,
      destinationPath: tempPath,
    })
    const mp4 = await extractPreviewMp4Bytes(tempPath, atMs, durationMs)
    if (!mp4) {
      return apiError(request, 503, 'dependency_unavailable', 'Preview extraction failed', {
        retryable: true,
      })
    }
    return new Response(new Uint8Array(mp4), {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Cache-Control': 'private, max-age=300',
        'Content-Length': String(mp4.byteLength),
      },
    })
  } catch {
    return apiError(request, 503, 'dependency_unavailable', 'Preview extraction unavailable', {
      retryable: true,
    })
  } finally {
    await unlink(tempPath).catch(() => {})
  }
}
