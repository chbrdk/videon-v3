import { apiError, apiJson } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import { listMediaForWorkspace } from '@/lib/db/media'
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
    const items = await listMediaForWorkspace(resolved.workspace.id)
    return apiJson(request, {
      platformProjectId,
      workspaceId: resolved.workspace.id,
      workspaceStatus: resolved.workspace.status,
      items,
    })
  } catch {
    return apiError(request, 503, 'dependency_unavailable', 'Media listing failed', { retryable: true })
  }
}
