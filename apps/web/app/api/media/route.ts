import { apiError, apiJson } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import { listMediaForAccessibleProjects, listMediaForWorkspace } from '@/lib/db/media'
import { fetchAccessibleCollections } from '@/lib/plexon-collections'
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

  try {
    if (platformProjectId) {
      const resolved = await resolveAccessibleWorkspace({ plexonUserId: userId, platformProjectId })
      if (!resolved.ok) {
        const status =
          resolved.code === 'collection_access_denied' ? 403 : resolved.code === 'not_found' ? 404 : 503
        return apiError(request, status, resolved.code, 'Collection workspace unavailable', {
          retryable: resolved.code === 'dependency_unavailable',
        })
      }
      const items = await listMediaForWorkspace(resolved.workspace.id)
      return apiJson(request, {
        scope: 'project',
        platformProjectId,
        workspaceId: resolved.workspace.id,
        workspaceStatus: resolved.workspace.status,
        items: items.map((item) => ({
          ...item,
          platformProjectId,
          projectName: resolved.collection?.name ?? null,
        })),
      })
    }

    const directory = await fetchAccessibleCollections(userId)
    if (!directory) {
      return apiError(request, 503, 'dependency_unavailable', 'PLEXON project directory is unavailable', {
        retryable: true,
      })
    }

    const nameById = new Map(directory.items.map((item) => [item.id, item.name]))
    const rows = await listMediaForAccessibleProjects({
      platformProjectIds: directory.items.map((item) => item.id),
      plexonUserId: userId,
    })

    return apiJson(request, {
      scope: 'accessible',
      truncated: directory.truncated ?? false,
      items: rows.map((item) => ({
        ...item,
        projectName: nameById.get(item.platformProjectId) ?? null,
      })),
    })
  } catch (error) {
    console.error('[VIDEON-v3] Media listing failed', {
      hasPlatformProjectId: Boolean(platformProjectId),
      message: error instanceof Error ? error.message : String(error),
    })
    return apiError(request, 503, 'dependency_unavailable', 'Media listing failed', { retryable: true })
  }
}
