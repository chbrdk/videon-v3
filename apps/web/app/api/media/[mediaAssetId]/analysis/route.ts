import { apiError, apiJson } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import { STEM_DEMUCS_CAPABILITY } from '@/lib/pipeline/constants'
import { scheduleMediaAnalysisRerun } from '@/lib/pipeline/enqueue'
import { resolveMediaInWorkspace } from '@/lib/media-access'
import { requireSessionUserId } from '@/lib/session-user'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ mediaAssetId: string }> }

export async function POST(request: Request, context: RouteContext) {
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

  let body: { stemMethod?: string } = {}
  try {
    body = (await request.json()) as { stemMethod?: string }
  } catch {
    body = {}
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
    return apiError(request, 409, 'invalid_payload', 'Upload must finish before analysis can start')
  }
  if (resolved.media.lifecycleState === 'archived') {
    return apiError(request, 403, 'collection_access_denied', 'Archived media cannot be analyzed')
  }

  const wantsDemucs = body.stemMethod === 'demucs'

  try {
    const scheduled = await scheduleMediaAnalysisRerun({
      mediaAssetId: resolved.media.id,
      workspaceId: resolved.workspace.id,
      requestedByPlexonUserId: userId,
      checksumSha256: resolved.media.checksumSha256,
      extraCapabilities: wantsDemucs ? [STEM_DEMUCS_CAPABILITY] : [],
    })
    return apiJson(request, {
      analysis: scheduled,
      stemMethod: wantsDemucs ? 'demucs' : 'ffmpeg_mid_side',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Analysis could not be scheduled'
    return apiError(request, 503, 'dependency_unavailable', message, { retryable: true })
  }
}
