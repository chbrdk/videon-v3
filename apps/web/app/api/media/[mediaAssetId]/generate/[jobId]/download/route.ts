import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import { findMediaGenerationJob } from '@/lib/db/media-generation'
import { resolveMediaInWorkspace } from '@/lib/media-access'
import { requireSessionUserId } from '@/lib/session-user'
import { S3ObjectStore } from '@/lib/storage/s3-object-store'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ mediaAssetId: string; jobId: string }> }

export async function GET(request: Request, context: RouteContext) {
  const userId = await requireSessionUserId()
  if (!userId) return apiError(request, 401, 'service_unauthorized', 'Authentication required')
  if (!hasDatabaseConfig()) {
    return apiError(request, 503, 'dependency_unavailable', 'Workspace persistence is unavailable', {
      retryable: true,
    })
  }

  const url = new URL(request.url)
  const platformProjectId = url.searchParams.get('platformProjectId')?.trim() || ''
  if (!platformProjectId) {
    return apiError(request, 400, 'invalid_payload', 'platformProjectId is required')
  }
  const kindRaw = url.searchParams.get('kind')?.trim() || 'final'
  const kind = kindRaw === 'draft' ? 'draft' : 'final'

  const { mediaAssetId, jobId } = await context.params
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

  const job = await findMediaGenerationJob(jobId.trim())
  if (!job || job.mediaAssetId !== resolved.media.id || job.workspaceId !== resolved.media.workspaceId) {
    return apiError(request, 404, 'not_found', 'Generation job not found')
  }

  const storageKey = kind === 'draft' ? job.draftStorageKey : job.finalStorageKey
  if (kind === 'final' && (job.status !== 'succeeded' || !storageKey)) {
    return apiError(request, 409, 'invalid_payload', `Artifact final not ready (${job.status})`, {
      retryable: job.status === 'queued' || job.status === 'running' || job.status === 'draft_ready',
    })
  }
  if (kind === 'draft' && !storageKey) {
    return apiError(request, 409, 'invalid_payload', `Artifact draft not ready (${job.status})`, {
      retryable: job.status === 'queued' || job.status === 'running',
    })
  }

  const store = new S3ObjectStore()
  const target = await store.createDownloadTarget({
    workspaceId: resolved.media.workspaceId,
    mediaAssetId: resolved.media.id,
    storageKey: storageKey!,
    filename: `generate-${kind}-${job.id.slice(0, 8)}.mp4`,
    disposition: 'attachment',
  })
  return NextResponse.redirect(target.uploadUrl, 302)
}
