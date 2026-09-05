import { apiError, apiJson } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import { searchMediaInWorkspace } from '@/lib/db/search'
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
  if (!platformProjectId) {
    return apiError(request, 400, 'invalid_payload', 'platformProjectId is required')
  }
  if (!query) {
    return apiError(request, 400, 'invalid_payload', 'q is required')
  }

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

  const items = await searchMediaInWorkspace({ workspaceId: workspace.workspace.id, query })
  return apiJson(request, { query, items })
}
