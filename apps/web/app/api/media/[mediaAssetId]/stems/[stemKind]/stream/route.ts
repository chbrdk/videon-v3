import { apiError } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import { listLatestAudioStemsForMedia, type AudioStemKind } from '@/lib/db/media-stems'
import { objectStorageConfig } from '@/lib/runtime-config'
import { resolveMediaInWorkspace } from '@/lib/media-access'
import { requireSessionUserId } from '@/lib/session-user'
import { S3ObjectStore } from '@/lib/storage/s3-object-store'
import { Readable } from 'node:stream'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ mediaAssetId: string; stemKind: string }> }

function isStemKind(value: string): value is AudioStemKind {
  return value === 'voice' || value === 'music'
}

function sanitizeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'stem'
}

function contentDisposition(input: {
  stemKind: AudioStemKind
  mediaAssetId: string
  method: string
  download: boolean
}): string {
  const shortId = input.mediaAssetId.slice(0, 8)
  const track = input.stemKind === 'voice' ? 'a1-voice' : 'a2-music'
  const method = sanitizeFilenamePart(input.method)
  const filename = `videon-${shortId}-${track}-${method}.wav`
  const disposition = input.download ? 'attachment' : 'inline'
  return `${disposition}; filename="${filename}"`
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

  const url = new URL(request.url)
  const platformProjectId = url.searchParams.get('platformProjectId')?.trim() || ''
  if (!platformProjectId) {
    return apiError(request, 400, 'invalid_payload', 'platformProjectId is required')
  }
  const download =
    url.searchParams.get('download') === '1' ||
    url.searchParams.get('download') === 'true'

  const { mediaAssetId, stemKind: rawKind } = await context.params
  if (!isStemKind(rawKind)) {
    return apiError(request, 400, 'invalid_payload', 'stemKind must be voice or music')
  }

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

  const stems = await listLatestAudioStemsForMedia(resolved.media.id)
  const stem = stems.find((entry) => entry.stemKind === rawKind)
  if (!stem) {
    return apiError(request, 404, 'not_found', `No ${rawKind} stem for this media`)
  }

  const range = download ? null : request.headers.get('range')
  const store = new S3ObjectStore()
  const object = await store.openObjectStream({
    workspaceId: resolved.workspace.id,
    storageKey: stem.storageKey,
    range,
  })

  const headers = new Headers({
    'Content-Type': object.contentType ?? stem.mimeType ?? 'audio/wav',
    'Content-Disposition': contentDisposition({
      stemKind: rawKind,
      mediaAssetId: resolved.media.id,
      method: stem.method,
      download,
    }),
    'Accept-Ranges': download ? 'none' : (object.acceptRanges ?? 'bytes'),
    'Cache-Control': 'private, max-age=60',
    'X-Videon-Stem-Method': stem.method,
    'X-Videon-Stem-Kind': rawKind,
  })
  if (object.contentLength !== undefined) headers.set('Content-Length', String(object.contentLength))
  if (!download && object.contentRange) headers.set('Content-Range', object.contentRange)

  return new Response(Readable.toWeb(object.body) as ReadableStream, {
    status: download ? 200 : object.statusCode,
    headers,
  })
}
