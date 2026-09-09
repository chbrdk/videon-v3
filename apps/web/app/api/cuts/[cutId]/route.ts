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
  updateCutCanvas,
  addSceneToCut,
  addScenesToCut,
  rollTrimCutBoundary,
  restoreCutTimeline,
} from '@/lib/db/cuts'
import { findMediaAsset } from '@/lib/db/media'
import { resolveCutSceneInputs } from '@/lib/cut-scene-resolve'
import { CUT_CANVAS_DEFAULT_FPS, resolveCutCanvas } from '@/lib/cut-canvas'
import { findLatestTranscriptForMedia } from '@/lib/db/transcript'
import { listLatestAudioStemsForMediaIds } from '@/lib/db/media-stems'
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

  const stemsByMediaId = await listLatestAudioStemsForMediaIds(mediaIds)
  const stems: Record<
    string,
    { voicePeaks: number[]; musicPeaks: number[]; method: string | null; voice: boolean; music: boolean }
  > = {}
  for (const mediaAssetId of mediaIds) {
    const list = stemsByMediaId[mediaAssetId] ?? []
    const voice = list.find((stem) => stem.stemKind === 'voice')
    const music = list.find((stem) => stem.stemKind === 'music')
    if (!voice && !music) continue
    stems[mediaAssetId] = {
      voicePeaks: voice?.peaks ?? [],
      musicPeaks: music?.peaks ?? [],
      method: voice?.method ?? music?.method ?? null,
      voice: Boolean(voice),
      music: Boolean(music),
    }
  }

  return apiJson(request, { cut, clips: media, transcripts, stems })
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

  try {
    return await applyCutPatch({
      request,
      cut,
      workspaceId: workspace.workspace.id,
      action,
      sceneId,
      atMs,
      startMs,
      endMs,
      name,
      sceneIds,
      rawRestoreScenes,
      mediaAssetId,
      afterSceneId,
      leftSceneId,
      boundaryMs,
      record,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cut update failed'
    return apiError(request, 500, 'invalid_payload', message)
  }
}

async function applyCutPatch(input: {
  request: Request
  cut: NonNullable<Awaited<ReturnType<typeof findCut>>>
  workspaceId: string
  action: string
  sceneId: string
  atMs: number | null
  startMs: number | null
  endMs: number | null
  name: string
  sceneIds: string[]
  rawRestoreScenes: unknown[] | null
  mediaAssetId: string
  afterSceneId: string | null
  leftSceneId: string
  boundaryMs: number | null
  record: Record<string, unknown>
}): Promise<Response> {
  const {
    request,
    cut,
    workspaceId,
    action,
    sceneId,
    atMs,
    startMs,
    endMs,
    name,
    sceneIds,
    rawRestoreScenes,
    mediaAssetId,
    afterSceneId,
    leftSceneId,
    boundaryMs,
    record,
  } = input

  if (action === 'rename') {
    if (!name) return apiError(request, 400, 'invalid_payload', 'name is required for rename')
    const updated = await renameCut({ cutId: cut.id, workspaceId, name })
    if (!updated) return apiError(request, 409, 'invalid_payload', 'Cut could not be renamed')
    return apiJson(request, { cut: updated })
  }

  if (action === 'setCanvas') {
    const aspectPreset = typeof record.aspectPreset === 'string' ? record.aspectPreset.trim() : ''
    const resolved = resolveCutCanvas({
      aspectPreset,
      width: record.width,
      height: record.height,
    })
    if (!resolved.ok) return apiError(request, 400, 'invalid_payload', resolved.message)
    const updated = await updateCutCanvas({
      cutId: cut.id,
      workspaceId,
      width: resolved.width,
      height: resolved.height,
      defaultFrameRate: CUT_CANVAS_DEFAULT_FPS,
    })
    if (!updated) return apiError(request, 409, 'invalid_payload', 'Cut canvas could not be updated')
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
      sceneKey?: string | null
    }> = []
    for (const entry of rawRestoreScenes) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
      const scene = entry as Record<string, unknown>
      const id = typeof scene.id === 'string' ? scene.id.trim() : ''
      const mediaId = typeof scene.mediaAssetId === 'string' ? scene.mediaAssetId.trim() : ''
      const position = typeof scene.position === 'number' ? scene.position : restoreScenes.length
      const sceneStart = typeof scene.startMs === 'number' ? scene.startMs : null
      const sceneEnd = typeof scene.endMs === 'number' ? scene.endMs : null
      const sceneKey =
        typeof scene.sceneKey === 'string' && scene.sceneKey.trim() ? scene.sceneKey.trim() : null
      if (!id || !mediaId || sceneStart === null || sceneEnd === null) continue
      const media = await findMediaAsset(mediaId)
      if (!media || media.workspaceId !== workspaceId) {
        return apiError(request, 404, 'not_found', 'Media asset not found')
      }
      restoreScenes.push({
        id,
        position,
        mediaAssetId: mediaId,
        startMs: sceneStart,
        endMs: sceneEnd,
        sceneKey,
      })
    }
    const scenes = await restoreCutTimeline({ cutId: cut.id, scenes: restoreScenes })
    if (!scenes) return apiError(request, 409, 'invalid_payload', 'Timeline edit could not be applied')
    return apiJson(request, { scenes })
  }

  if (action === 'addScenes') {
    if (!rawRestoreScenes?.length) {
      return apiError(request, 400, 'invalid_payload', 'scenes is required for addScenes')
    }
    const resolved = await resolveCutSceneInputs(rawRestoreScenes)
    if (!resolved.ok) {
      return apiError(request, 400, 'invalid_payload', resolved.message)
    }
    for (const scene of resolved.scenes) {
      const media = await findMediaAsset(scene.mediaAssetId)
      if (!media || media.workspaceId !== workspaceId) {
        return apiError(request, 404, 'not_found', 'Media asset not found')
      }
    }
    const scenes = await addScenesToCut({
      cutId: cut.id,
      afterSceneId,
      scenes: resolved.scenes,
    })
    if (!scenes) return apiError(request, 409, 'invalid_payload', 'Timeline edit could not be applied')
    return apiJson(request, { scenes })
  }

  if (action === 'addScene') {
    if (!mediaAssetId) return apiError(request, 400, 'invalid_payload', 'mediaAssetId is required for addScene')
    if (startMs === null || endMs === null) {
      return apiError(request, 400, 'invalid_payload', 'startMs and endMs are required for addScene')
    }
    const media = await findMediaAsset(mediaAssetId)
    if (!media || media.workspaceId !== workspaceId) {
      return apiError(request, 404, 'not_found', 'Media asset not found')
    }
    const sceneKey =
      typeof record.sceneKey === 'string' && record.sceneKey.trim() ? record.sceneKey.trim() : null
    const scenes = await addSceneToCut({
      cutId: cut.id,
      mediaAssetId,
      startMs,
      endMs,
      sceneKey,
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
