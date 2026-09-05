import { apiError, apiJson } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import { archiveCut, findCut, listScenesForCut, splitCutScene, mergeCutSceneWithNext, deleteCutScene } from '@/lib/db/cuts'
import { findMediaAsset } from '@/lib/db/media'
import { requireSessionUserId } from '@/lib/session-user'
import { resolveWorkspaceForMediaRequest } from '@/lib/media-access'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ cutId: string }> }

export async function GET(request: Request, context: RouteContext) {
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

  const { cutId } = await context.params
  const cut = await findCut(cutId.trim())
  if (!cut || cut.workspaceId !== workspace.workspace.id) {
    return apiError(request, 404, 'not_found', 'Cut not found')
  }

  const scenes = await listScenesForCut(cut.id)
  const media = await Promise.all(
    scenes.map(async (scene) => ({
      scene,
      media: await findMediaAsset(scene.mediaAssetId),
    })),
  )

  return apiJson(request, { cut, clips: media })
}

export async function DELETE(request: Request, context: RouteContext) {
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

  const { cutId } = await context.params
  const archived = await archiveCut(cutId.trim(), workspace.workspace.id)
  if (!archived) return apiError(request, 404, 'not_found', 'Cut not found')
  return apiJson(request, { archived: true, cutId: cutId.trim() })
}

export async function PATCH(request: Request, context: RouteContext) {
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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError(request, 400, 'invalid_payload', 'JSON body is required')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return apiError(request, 400, 'invalid_payload', 'Invalid payload')
  }

  const record = body as Record<string, unknown>
  const action = typeof record.action === 'string' ? record.action.trim() : ''
  const sceneId = typeof record.sceneId === 'string' ? record.sceneId.trim() : ''
  const atMs = typeof record.atMs === 'number' ? record.atMs : null

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

  const { cutId } = await context.params
  const cut = await findCut(cutId.trim())
  if (!cut || cut.workspaceId !== workspace.workspace.id) {
    return apiError(request, 404, 'not_found', 'Cut not found')
  }
  if (!sceneId) return apiError(request, 400, 'invalid_payload', 'sceneId is required')

  let scenes = null
  if (action === 'split') {
    if (atMs === null) return apiError(request, 400, 'invalid_payload', 'atMs is required for split')
    scenes = await splitCutScene({ cutId: cut.id, sceneId, atMs })
  } else if (action === 'merge') {
    scenes = await mergeCutSceneWithNext({ cutId: cut.id, sceneId })
  } else if (action === 'delete') {
    scenes = await deleteCutScene({ cutId: cut.id, sceneId })
  } else {
    return apiError(request, 400, 'invalid_payload', 'Unsupported action')
  }

  if (!scenes) return apiError(request, 409, 'invalid_payload', 'Timeline edit could not be applied')
  return apiJson(request, { scenes })
}
