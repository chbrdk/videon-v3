import { apiError, apiJson } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import {
  buildReframeIdempotencyKey,
  createMediaReframe,
  listMediaReframesForMedia,
  type MediaReframeAspect,
} from '@/lib/db/media-reframes'
import { enqueueMediaReframeJob, pipelineQueueConfigured } from '@/lib/jobs/pg-boss-queue'
import { resolveMediaInWorkspace, resolveWorkspaceForMediaRequest } from '@/lib/media-access'
import { paths } from '@/lib/paths'
import { requireSessionUserId } from '@/lib/session-user'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ mediaAssetId: string }> }

const ASPECTS = new Set<MediaReframeAspect>(['9:16', '16:9', '1:1', 'custom'])

function platformProjectIdFrom(request: Request): string {
  return new URL(request.url).searchParams.get('platformProjectId')?.trim() || ''
}

export async function GET(request: Request, context: RouteContext) {
  const userId = await requireSessionUserId()
  if (!userId) return apiError(request, 401, 'service_unauthorized', 'Authentication required')
  if (!hasDatabaseConfig()) {
    return apiError(request, 503, 'dependency_unavailable', 'Workspace persistence is unavailable', {
      retryable: true,
    })
  }

  const platformProjectId = platformProjectIdFrom(request)
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

  const reframes = await listMediaReframesForMedia(resolved.media.id)
  return apiJson(request, { reframes })
}

export async function POST(request: Request, context: RouteContext) {
  const userId = await requireSessionUserId()
  if (!userId) return apiError(request, 401, 'service_unauthorized', 'Authentication required')
  if (!hasDatabaseConfig()) {
    return apiError(request, 503, 'dependency_unavailable', 'Workspace persistence is unavailable', {
      retryable: true,
    })
  }
  if (!pipelineQueueConfigured()) {
    return apiError(request, 503, 'dependency_unavailable', 'Job queue is unavailable', { retryable: true })
  }

  const platformProjectId = platformProjectIdFrom(request)
  if (!platformProjectId) {
    return apiError(request, 400, 'invalid_payload', 'platformProjectId is required')
  }

  const workspace = await resolveWorkspaceForMediaRequest({
    plexonUserId: userId,
    platformProjectId,
    writable: true,
  })
  if (!workspace.ok) {
    const status =
      workspace.code === 'collection_access_denied' ? 403 : workspace.code === 'not_found' ? 404 : 503
    return apiError(request, status, workspace.code, 'Collection workspace unavailable', {
      retryable: workspace.code === 'dependency_unavailable',
    })
  }

  const { mediaAssetId } = await context.params
  const resolved = await resolveMediaInWorkspace({
    plexonUserId: userId,
    platformProjectId,
    mediaAssetId,
    writable: true,
  })
  if (!resolved.ok) {
    const status =
      resolved.code === 'collection_access_denied' ? 403 : resolved.code === 'not_found' ? 404 : 503
    return apiError(request, status, resolved.code, 'Media asset unavailable', {
      retryable: resolved.code === 'dependency_unavailable',
    })
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    body = {}
  }

  const aspectRatio = typeof body.aspectRatio === 'string' ? body.aspectRatio.trim() : '9:16'
  if (!ASPECTS.has(aspectRatio as MediaReframeAspect)) {
    return apiError(request, 400, 'invalid_payload', 'aspectRatio must be 9:16, 16:9, 1:1, or custom')
  }
  const aspect = aspectRatio as MediaReframeAspect
  const customWidth =
    typeof body.customWidth === 'number' && Number.isFinite(body.customWidth)
      ? Math.floor(body.customWidth)
      : null
  const customHeight =
    typeof body.customHeight === 'number' && Number.isFinite(body.customHeight)
      ? Math.floor(body.customHeight)
      : null
  if (aspect === 'custom') {
    if (!customWidth || !customHeight || customWidth <= 0 || customHeight <= 0) {
      return apiError(request, 400, 'invalid_payload', 'customWidth and customHeight are required')
    }
    if (customWidth > 3840 || customHeight > 3840) {
      return apiError(request, 400, 'invalid_payload', 'custom dimensions must be ≤ 3840')
    }
  }
  const smoothingFactor =
    typeof body.smoothingFactor === 'number' && Number.isFinite(body.smoothingFactor)
      ? Math.min(1, Math.max(0, body.smoothingFactor))
      : 0.3
  const saliencyModel =
    typeof body.saliencyModel === 'string' ? body.saliencyModel.trim() : 'robust_v1'
  if (saliencyModel !== 'robust_v1') {
    return apiError(request, 400, 'invalid_payload', 'Only saliencyModel=robust_v1 is supported')
  }

  const idempotencyKey =
    (typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()) ||
    buildReframeIdempotencyKey({
      mediaAssetId: resolved.media.id,
      aspectRatio: aspect,
      customWidth: aspect === 'custom' ? customWidth : null,
      customHeight: aspect === 'custom' ? customHeight : null,
      smoothingFactor,
      saliencyModel: 'robust_v1',
    })

  const reframe = await createMediaReframe({
    mediaAssetId: resolved.media.id,
    workspaceId: workspace.workspace.id,
    requestedByPlexonUserId: userId,
    aspectRatio: aspect,
    customWidth: aspect === 'custom' ? customWidth : null,
    customHeight: aspect === 'custom' ? customHeight : null,
    smoothingFactor,
    saliencyModel: 'robust_v1',
    idempotencyKey,
  })

  if (reframe.status === 'queued') {
    await enqueueMediaReframeJob({
      reframeId: reframe.id,
      mediaAssetId: resolved.media.id,
    })
  }

  return apiJson(
    request,
    {
      reframe: {
        ...reframe,
        deepLink: paths.routes.mediaFor(resolved.media.id, platformProjectId),
      },
    },
    202,
  )
}
