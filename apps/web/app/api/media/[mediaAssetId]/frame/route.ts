import { createHash } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { apiError } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import {
  frameCacheKey,
  getCachedFrame,
  setCachedFrame,
} from '@/lib/media-frame-cache'
import { mediaFrameSeekMs } from '@/lib/pipeline/poster-frames'
import { resolveMediaInWorkspace } from '@/lib/media-access'
import { extractFrameJpegBytes } from '@/lib/pipeline/frame-sample'
import {
  readPosterJpeg,
  snapFrameWidth,
  uploadPosterJpeg,
} from '@/lib/pipeline/poster-frames'
import { objectStorageConfig } from '@/lib/runtime-config'
import { requireSessionUserId } from '@/lib/session-user'
import { S3ObjectStore } from '@/lib/storage/s3-object-store'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ mediaAssetId: string }> }

function parseTimestampMs(raw: string | null): number {
  if (raw == null || raw.trim() === '') return 1000
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return 1000
  return mediaFrameSeekMs(Math.floor(n))
}

function parseWidth(raw: string | null): number {
  if (raw == null || raw.trim() === '') return snapFrameWidth(undefined)
  return snapFrameWidth(Number(raw))
}

function jpegResponse(bytes: Buffer, cache: 's3' | 'memory' | 'miss') {
  const etag = `"${createHash('sha1').update(bytes).digest('hex')}"`
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'private, max-age=86400',
      'Content-Length': String(bytes.byteLength),
      ETag: etag,
      'X-Videon-Frame-Cache': cache,
    },
  })
}

/**
 * GET /api/media/:id/frame — JPEG still for assistant + editor posters.
 * Spec: specs/api/media-frame.md · cut-editor-load-performance.md Wave 4
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
  const maxWidth = parseWidth(url.searchParams.get('w'))

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

  const ifNoneMatch = request.headers.get('if-none-match')
  const cacheKey = frameCacheKey({
    workspaceId: resolved.workspace.id,
    mediaAssetId,
    tMs: atMs,
    maxWidth,
  })
  const memoryHit = getCachedFrame(cacheKey)
  if (memoryHit) {
    const etag = `"${createHash('sha1').update(memoryHit).digest('hex')}"`
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag, 'X-Videon-Frame-Cache': 'memory' } })
    }
    return jpegResponse(memoryHit, 'memory')
  }

  const store = new S3ObjectStore()
  const s3Hit = await readPosterJpeg({
    store,
    workspaceId: resolved.workspace.id,
    mediaAssetId,
    maxWidth,
    tMs: atMs,
  })
  if (s3Hit) {
    setCachedFrame(cacheKey, s3Hit, { ttlMs: 24 * 60 * 60 * 1000 })
    const etag = `"${createHash('sha1').update(s3Hit).digest('hex')}"`
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag, 'X-Videon-Frame-Cache': 's3' } })
    }
    return jpegResponse(s3Hit, 's3')
  }

  const tempPath = join(tmpdir(), `videon-frame-src-${randomUUID()}`)
  try {
    await store.downloadObjectToFile({
      workspaceId: resolved.workspace.id,
      storageKey: resolved.media.storageKey,
      destinationPath: tempPath,
    })
    const jpeg = await extractFrameJpegBytes(tempPath, atMs, { maxWidth })
    if (!jpeg) {
      return apiError(request, 503, 'dependency_unavailable', 'Frame extraction failed', {
        retryable: true,
      })
    }
    setCachedFrame(cacheKey, jpeg, { ttlMs: 24 * 60 * 60 * 1000 })
    void uploadPosterJpeg({
      store,
      workspaceId: resolved.workspace.id,
      mediaAssetId,
      maxWidth,
      tMs: atMs,
      jpeg,
    }).catch(() => {})
    return jpegResponse(jpeg, 'miss')
  } catch {
    return apiError(request, 503, 'dependency_unavailable', 'Frame extraction unavailable', {
      retryable: true,
    })
  } finally {
    await unlink(tempPath).catch(() => {})
  }
}
