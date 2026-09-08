import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import { findMediaReframe } from '@/lib/db/media-reframes'
import { resolveMediaInWorkspace } from '@/lib/media-access'
import { requireSessionUserId } from '@/lib/session-user'
import { S3ObjectStore } from '@/lib/storage/s3-object-store'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ mediaAssetId: string; reframeId: string }> }

export async function GET(request: Request, context: RouteContext) {
  const userId = await requireSessionUserId()
  if (!userId) return apiError(request, 401, 'service_unauthorized', 'Authentication required')
  if (!hasDatabaseConfig()) {
    return apiError(request, 503, 'dependency_unavailable', 'Workspace persistence is unavailable', {
      retryable: true,
    })
  }

  const platformProjectId = new URL(request.url).searchParams.get('platformProjectId')?.trim() || ''
  if (!platformProjectId) {
    return apiError(request, 400, 'invalid_payload', 'platformProjectId is required')
  }

  const { mediaAssetId, reframeId } = await context.params
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

  const reframe = await findMediaReframe(reframeId.trim())
  if (!reframe || reframe.mediaAssetId !== resolved.media.id || reframe.workspaceId !== resolved.media.workspaceId) {
    return apiError(request, 404, 'not_found', 'Reframe not found')
  }

  if (reframe.status !== 'succeeded' || !reframe.storageKey) {
    return apiError(request, 409, 'invalid_payload', `Reframe is ${reframe.status}`, {
      retryable: reframe.status === 'queued' || reframe.status === 'running',
    })
  }

  const store = new S3ObjectStore()
  const target = await store.createDownloadTarget({
    workspaceId: resolved.media.workspaceId,
    mediaAssetId: resolved.media.id,
    storageKey: reframe.storageKey,
    filename: `reframe-${reframe.aspectRatio.replace(':', 'x')}.mp4`,
    disposition: 'attachment',
  })
  return NextResponse.redirect(target.uploadUrl, 302)
}
