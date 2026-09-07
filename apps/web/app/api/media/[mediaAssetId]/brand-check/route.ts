import { apiError, apiJson } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import { findLatestAnalysisForMedia, listSceneInsightsForAnalysis } from '@/lib/db/analysis'
import { scheduleBrandCompliance } from '@/lib/pipeline/enqueue'
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

  const analysis = await findLatestAnalysisForMedia(resolved.media.id)
  if (!analysis) {
    return apiError(request, 409, 'invalid_payload', 'Keine Analyse vorhanden — zuerst Analyse ausführen')
  }
  if (analysis.status !== 'succeeded') {
    return apiError(request, 409, 'invalid_payload', 'Brand-Check braucht eine erfolgreiche Analyse')
  }

  const scenes = await listSceneInsightsForAnalysis(analysis.id)
  if (scenes.length === 0) {
    return apiError(
      request,
      409,
      'invalid_payload',
      'Keine Szenen-Insights vorhanden — zuerst Analyse ausführen',
    )
  }

  try {
    const scheduled = await scheduleBrandCompliance({ mediaAssetId: resolved.media.id })
    return apiJson(request, {
      analysisRunId: scheduled.analysisRunId,
      queued: scheduled.queued,
      sceneCount: scenes.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Brand check could not be scheduled'
    return apiError(request, 503, 'dependency_unavailable', message, { retryable: true })
  }
}
