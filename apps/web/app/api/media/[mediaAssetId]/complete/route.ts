import { apiError, apiJson } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import { findMediaAsset, markMediaUploaded } from '@/lib/db/media'
import { requireSessionUserId } from '@/lib/session-user'
import { resolveAccessibleWorkspace } from '@/lib/workspace-access'

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

  const { mediaAssetId } = await context.params
  const media = await findMediaAsset(mediaAssetId.trim())
  if (!media) return apiError(request, 404, 'not_found', 'Media asset not found')

  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const platformProjectId =
    body && typeof body === 'object' && !Array.isArray(body) && typeof (body as { platformProjectId?: unknown }).platformProjectId === 'string'
      ? (body as { platformProjectId: string }).platformProjectId.trim()
      : ''

  if (!platformProjectId) {
    return apiError(request, 400, 'invalid_payload', 'platformProjectId is required')
  }

  const resolved = await resolveAccessibleWorkspace({ plexonUserId: userId, platformProjectId })
  if (!resolved.ok) {
    const status = resolved.code === 'collection_access_denied' ? 403 : resolved.code === 'not_found' ? 404 : 503
    return apiError(request, status, resolved.code, 'Collection workspace unavailable')
  }
  if (resolved.workspace.id !== media.workspaceId) {
    return apiError(request, 403, 'collection_access_denied', 'Media does not belong to this Collection')
  }
  if (resolved.workspace.status === 'archived') {
    return apiError(request, 403, 'collection_access_denied', 'Archived Collections are read-only')
  }

  const updated = await markMediaUploaded(media.id, resolved.workspace.id)
  if (!updated) {
    return apiError(request, 409, 'invalid_payload', 'Media is not in an uploading state')
  }
  return apiJson(request, { media: updated })
}
