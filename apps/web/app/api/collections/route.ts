import { apiError, apiJson } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import { fetchAccessibleCollections } from '@/lib/plexon-collections'
import { requireSessionUserId } from '@/lib/session-user'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const userId = await requireSessionUserId()
  if (!userId) return apiError(request, 401, 'service_unauthorized', 'Authentication required')
  if (!hasDatabaseConfig()) {
    return apiError(request, 503, 'dependency_unavailable', 'Workspace persistence is unavailable', {
      retryable: true,
    })
  }

  const collections = await fetchAccessibleCollections(userId)
  if (!collections) {
    return apiError(request, 503, 'dependency_unavailable', 'PLEXON Collection directory is unavailable', {
      retryable: true,
    })
  }

  return apiJson(request, collections)
}
