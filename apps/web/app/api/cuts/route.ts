import { apiError, apiJson } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import { createCutWithScenes, listCutsForWorkspace } from '@/lib/db/cuts'
import { findMediaAssetDetail } from '@/lib/db/media'
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

  const items = await listCutsForWorkspace(workspace.workspace.id)
  return apiJson(request, { items })
}

export async function POST(request: Request) {
  const userId = await requireSessionUserId()
  if (!userId) return apiError(request, 401, 'service_unauthorized', 'Authentication required')
  if (!hasDatabaseConfig()) {
    return apiError(request, 503, 'dependency_unavailable', 'Workspace persistence is unavailable', {
      retryable: true,
    })
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
  const platformProjectId = typeof record.platformProjectId === 'string' ? record.platformProjectId.trim() : ''
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const mediaAssetId = typeof record.mediaAssetId === 'string' ? record.mediaAssetId.trim() : ''
  const startMs = typeof record.startMs === 'number' ? Math.max(0, Math.floor(record.startMs)) : 0
  const endMs = typeof record.endMs === 'number' ? Math.max(startMs + 1, Math.floor(record.endMs)) : null
  const rawScenes = Array.isArray(record.scenes) ? record.scenes : null

  if (!platformProjectId || !name) {
    return apiError(request, 400, 'invalid_payload', 'platformProjectId and name are required')
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

  const media = await findMediaAssetDetail(mediaAssetId || '')
  const sceneInputs: Array<{ mediaAssetId: string; startMs: number; endMs: number }> = []

  if (rawScenes?.length) {
    for (const entry of rawScenes) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
      const scene = entry as Record<string, unknown>
      const sceneMediaId = typeof scene.mediaAssetId === 'string' ? scene.mediaAssetId.trim() : ''
      const sceneStart = typeof scene.startMs === 'number' ? Math.max(0, Math.floor(scene.startMs)) : 0
      const sceneEnd = typeof scene.endMs === 'number' ? Math.max(sceneStart + 1, Math.floor(scene.endMs)) : 0
      if (!sceneMediaId || sceneEnd <= sceneStart) continue
      sceneInputs.push({ mediaAssetId: sceneMediaId, startMs: sceneStart, endMs: sceneEnd })
    }
  }

  if (!sceneInputs.length) {
    if (!mediaAssetId) {
      return apiError(request, 400, 'invalid_payload', 'mediaAssetId or scenes are required')
    }
    if (!media || media.workspaceId !== workspace.workspace.id) {
      return apiError(request, 404, 'not_found', 'Media asset not found')
    }
    const durationMs = media.durationMs ?? endMs ?? 60_000
    sceneInputs.push({ mediaAssetId: media.id, startMs, endMs: endMs ?? durationMs })
  } else {
    for (const scene of sceneInputs) {
      const sceneMedia = await findMediaAssetDetail(scene.mediaAssetId)
      if (!sceneMedia || sceneMedia.workspaceId !== workspace.workspace.id) {
        return apiError(request, 404, 'not_found', 'Media asset not found')
      }
    }
  }

  const primaryMedia = media ?? (await findMediaAssetDetail(sceneInputs[0].mediaAssetId))
  if (!primaryMedia) {
    return apiError(request, 404, 'not_found', 'Media asset not found')
  }

  const created = await createCutWithScenes({
    workspaceId: workspace.workspace.id,
    createdByPlexonUserId: userId,
    name,
    width: primaryMedia.width,
    height: primaryMedia.height,
    frameRate: primaryMedia.frameRate,
    scenes: sceneInputs,
  })

  return apiJson(request, created, 201)
}
