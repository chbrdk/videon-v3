import { apiError, apiJson } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import { searchMediaForAccessibleProjects, searchMediaInWorkspace } from '@/lib/db/search'
import { buildSceneSearchPlan } from '@/lib/scene-search-query'
import { fetchAccessibleCollections } from '@/lib/plexon-collections'
import { requireSessionUserId } from '@/lib/session-user'
import { resolveWorkspaceForMediaRequest } from '@/lib/media-access'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const userId = await requireSessionUserId()
  if (!userId) return apiError(request, 401, 'service_unauthorized', 'Authentication required')
  if (!hasDatabaseConfig()) {
    return apiError(request, 503, 'dependency_unavailable', 'Workspace persistence is unavailable', {
      retryable: true,
    })
  }

  const url = new URL(request.url)
  const platformProjectId = url.searchParams.get('platformProjectId')?.trim() || ''
  const query = url.searchParams.get('q')?.trim() || ''
  if (!query) {
    return apiError(request, 400, 'invalid_payload', 'q is required')
  }

  const limitRaw = Number.parseInt(url.searchParams.get('limit') || '', 10)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 40) : 20

  const plan = buildSceneSearchPlan(query)

  try {
    if (platformProjectId) {
      const workspace = await resolveWorkspaceForMediaRequest({
        plexonUserId: userId,
        platformProjectId,
      })
      if (!workspace.ok) {
        const status =
          workspace.code === 'collection_access_denied' ? 403 : workspace.code === 'not_found' ? 404 : 503
        return apiError(request, status, workspace.code, 'Collection workspace unavailable', {
          retryable: workspace.code === 'dependency_unavailable',
        })
      }

      const items = await searchMediaInWorkspace({
        workspaceId: workspace.workspace.id,
        query,
        limit,
      })
      return apiJson(request, {
        scope: 'project',
        query,
        terms: plan.terms,
        limit,
        items: items.map((item) => ({ ...item, platformProjectId })),
      })
    }

    const directory = await fetchAccessibleCollections(userId)
    if (!directory) {
      return apiError(request, 503, 'dependency_unavailable', 'PLEXON project directory is unavailable', {
        retryable: true,
      })
    }

    const { hits, planTerms } = await searchMediaForAccessibleProjects({
      platformProjectIds: directory.items.map((item) => item.id),
      plexonUserId: userId,
      query,
      limit,
    })
    const nameById = new Map(directory.items.map((item) => [item.id, item.name]))

    return apiJson(request, {
      scope: 'accessible',
      query,
      terms: planTerms.length ? planTerms : plan.terms,
      limit,
      truncated: directory.truncated,
      items: hits.map((item) => ({
        ...item,
        projectName: item.platformProjectId ? nameById.get(item.platformProjectId) ?? null : null,
      })),
    })
  } catch (error) {
    console.error('[VIDEON-v3] Media search failed', {
      hasPlatformProjectId: Boolean(platformProjectId),
      message: error instanceof Error ? error.message : String(error),
    })
    return apiError(request, 503, 'dependency_unavailable', 'Media search failed', { retryable: true })
  }
}
