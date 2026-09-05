import { apiError, apiJson } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import {
  archiveCut,
  findCut,
  listScenesForCut,
  splitCutScene,
  mergeCutSceneWithNext,
  deleteCutScene,
  trimCutScene,
  reorderCutScenes,
  renameCut,
  addSceneToCut,
  rollTrimCutBoundary,
  restoreCutTimeline,
} from '@/lib/db/cuts'
import { findMediaAsset } from '@/lib/db/media'
import { findLatestTranscriptForMedia } from '@/lib/db/transcript'
import type { TranscriptSegment } from '@/lib/cut-timeline'
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

  const mediaIds = [...new Set(scenes.map((scene) => scene.mediaAssetId))]
  const transcripts: Record<string, TranscriptSegment[]> = {}
  for (const mediaAssetId of mediaIds) {
    const transcript = await findLatestTranscriptForMedia(mediaAssetId)
    if (!transcript || transcript.status !== 'ready') continue
    transcripts[mediaAssetId] = (transcript.segments as TranscriptSegment[]).filter(
      (segment) =>
        typeof segment?.startMs === 'number' &&
        typeof segment?.endMs === 'number' &&
        typeof segment?.text === 'string',
    )
  }

  return apiJson(request, { cut, clips: media, transcripts })
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
  const startMs = typeof record.startMs === 'number' ? record.startMs : null
  const endMs = typeof record.endMs === 'number' ? record.endMs : null
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const sceneIds = Array.isArray(record.sceneIds)
    ? record.sceneIds.filter((value): value is string => typeof value === 'string').map((value) => value.trim())
    : []
  const rawRestoreScenes = Array.isArray(record.scenes) ? record.scenes : null
  const mediaAssetId = typeof record.mediaAssetId === 'string' ? record.mediaAssetId.trim() : ''
  const afterSceneId = typeof record.afterSceneId === 'string' ? record.afterSceneId.trim() : null
  const leftSceneId = typeof record.leftSceneId === 'string' ? record.leftSceneId.trim() : ''
  const boundaryMs = typeof record.boundaryMs === 'number' ? record.boundaryMs : null

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

  if (action === 'rename') {
    if (!name) return apiError(request, 400, 'invalid_payload', 'name is required for rename')
    const updated = await renameCut({ cutId: cut.id, workspaceId: workspace.workspace.id, name })
    if (!updated) return apiError(request, 409, 'invalid_payload', 'Cut could not be renamed')
    return apiJson(request, { cut: updated })
  }

  if (action === 'reorder') {
    if (sceneIds.length === 0) {
      return apiError(request, 400, 'invalid_payload', 'sceneIds is required for reorder')
    }
    const scenes = await reorderCutScenes({ cutId: cut.id, sceneIds })
    if (!scenes) return apiError(request, 409, 'invalid_payload', 'Timeline edit could not be applied')
    return apiJson(request, { scenes })
  }

  if (action === 'restore') {
    if (!rawRestoreScenes?.length) {
      return apiError(request, 400, 'invalid_payload', 'scenes is required for restore')
    }
    const restoreScenes: Array<{
      id: string
      position: number
      mediaAssetId: string
      startMs: number
      endMs: number
    }> = []
    for (const entry of rawRestoreScenes) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
      const scene = entry as Record<string, unknown>
      const id = typeof scene.id === 'string' ? scene.id.trim() : ''
      const mediaId = typeof scene.mediaAssetId === 'string' ? scene.mediaAssetId.trim() : ''
      const position = typeof scene.position === 'number' ? scene.position : restoreScenes.length
      const sceneStart = typeof scene.startMs === 'number' ? scene.startMs : null
      const sceneEnd = typeof scene.endMs === 'number' ? scene.endMs : null
      if (!id || !mediaId || sceneStart === null || sceneEnd === null) continue
      const media = await findMediaAsset(mediaId)
      if (!media || media.workspaceId !== workspace.workspace.id) {
        return apiError(request, 404, 'not_found', 'Media asset not found')
      }
      restoreScenes.push({
        id,
        position,
        mediaAssetId: mediaId,
        startMs: sceneStart,
        endMs: sceneEnd,
      })
    }
    const scenes = await restoreCutTimeline({ cutId: cut.id, scenes: restoreScenes })
    if (!scenes) return apiError(request, 409, 'invalid_payload', 'Timeline edit could not be applied')
    return apiJson(request, { scenes })
  }

  if (action === 'addScene') {
    if (!mediaAssetId) return apiError(request, 400, 'invalid_payload', 'mediaAssetId is required for addScene')
    if (startMs === null || endMs === null) {
      return apiError(request, 400, 'invalid_payload', 'startMs and endMs are required for addScene')
    }
    const media = await findMediaAsset(mediaAssetId)
    if (!media || media.workspaceId !== workspace.workspace.id) {
      return apiError(request, 404, 'not_found', 'Media asset not found')
    }
    const scenes = await addSceneToCut({
      cutId: cut.id,
      mediaAssetId,
      startMs,
      endMs,
      afterSceneId,
    })
    if (!scenes) return apiError(request, 409, 'invalid_payload', 'Timeline edit could not be applied')
    return apiJson(request, { scenes })
  }

  if (action === 'rollTrim') {
    if (!leftSceneId) return apiError(request, 400, 'invalid_payload', 'leftSceneId is required for rollTrim')
    if (boundaryMs === null) return apiError(request, 400, 'invalid_payload', 'boundaryMs is required for rollTrim')
    const scenes = await rollTrimCutBoundary({ cutId: cut.id, leftSceneId, boundaryMs })
    if (!scenes) return apiError(request, 409, 'invalid_payload', 'Timeline edit could not be applied')
    return apiJson(request, { scenes })
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
  } else if (action === 'trim') {
    if (startMs === null && endMs === null) {
      return apiError(request, 400, 'invalid_payload', 'startMs or endMs is required for trim')
    }
    scenes = await trimCutScene({
      cutId: cut.id,
      sceneId,
      ...(startMs !== null ? { startMs } : {}),
      ...(endMs !== null ? { endMs } : {}),
    })
  } else {
    return apiError(request, 400, 'invalid_payload', 'Unsupported action')
  }

  if (!scenes) return apiError(request, 409, 'invalid_payload', 'Timeline edit could not be applied')
  return apiJson(request, { scenes })
}
