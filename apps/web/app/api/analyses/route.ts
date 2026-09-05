import { apiError, apiJson } from '@/lib/api-response'
import { listAnalysisRunsForWorkspace, listStagesForAnalysisRuns } from '@/lib/db/analysis'
import { hasDatabaseConfig } from '@/lib/db/client'
import { requireSessionUserId } from '@/lib/session-user'
import { resolveAccessibleWorkspace } from '@/lib/workspace-access'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
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

  try {
    const resolved = await resolveAccessibleWorkspace({ plexonUserId: userId, platformProjectId })
    if (!resolved.ok) {
      const status = resolved.code === 'collection_access_denied' ? 403 : resolved.code === 'not_found' ? 404 : 503
      return apiError(request, status, resolved.code, 'Collection workspace unavailable', {
        retryable: resolved.code === 'dependency_unavailable',
      })
    }
    const items = await listAnalysisRunsForWorkspace(resolved.workspace.id)
    const stagesByRun = await listStagesForAnalysisRuns(items.map((item) => item.id))
    return apiJson(request, {
      platformProjectId,
      workspaceId: resolved.workspace.id,
      items: items.map((item) => ({
        ...item,
        stages: (stagesByRun[item.id] ?? []).map((stage) => ({
          stageKey: stage.stageKey,
          status: stage.status,
          progressCompleted: stage.progressCompleted,
          progressTotal: stage.progressTotal,
          errorCode: stage.errorCode,
          errorMessage: stage.errorMessage,
        })),
      })),
    })
  } catch {
    return apiError(request, 503, 'dependency_unavailable', 'Analysis listing failed', { retryable: true })
  }
}
