import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { databasePool } from './client'

export type CutStatus = 'draft' | 'ready' | 'archived'

export type Cut = {
  id: string
  workspaceId: string
  createdByPlexonUserId: string
  name: string
  width: number | null
  height: number | null
  frameRate: number | null
  status: CutStatus
  createdAt: string
  updatedAt: string
}

export type CutScene = {
  id: string
  cutId: string
  position: number
  mediaAssetId: string
  startMs: number
  endMs: number
  timelineStartMs: number
  sceneKey: string | null
  /** Opaque Premiere <filter> XML; not shown in Videon UI. */
  premiereFiltersXml: string | null
  createdAt: string
}

type CutRow = {
  id: string
  workspace_id: string
  created_by_plexon_user_id: string
  name: string
  width: number | null
  height: number | null
  frame_rate: string | number | null
  status: CutStatus
  created_at: Date | string
  updated_at: Date | string
}

type CutSceneRow = {
  id: string
  cut_id: string
  position: number
  media_asset_id: string
  start_ms: number
  end_ms: number
  timeline_start_ms: number
  scene_key: string | null
  premiere_filters_xml: string | null
  created_at: Date | string
}

const CUT_SCENE_SELECT =
  'id, cut_id, position, media_asset_id, start_ms, end_ms, timeline_start_ms, scene_key, premiere_filters_xml, created_at'

function mapCut(row: CutRow): Cut {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    createdByPlexonUserId: row.created_by_plexon_user_id,
    name: row.name,
    width: row.width,
    height: row.height,
    frameRate: row.frame_rate === null ? null : Number(row.frame_rate),
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

function mapCutScene(row: CutSceneRow): CutScene {
  return {
    id: row.id,
    cutId: row.cut_id,
    position: row.position,
    mediaAssetId: row.media_asset_id,
    startMs: row.start_ms,
    endMs: row.end_ms,
    timelineStartMs: row.timeline_start_ms ?? 0,
    sceneKey: row.scene_key,
    premiereFiltersXml: row.premiere_filters_xml ?? null,
    createdAt: new Date(row.created_at).toISOString(),
  }
}

export async function listCutsForWorkspace(workspaceId: string): Promise<Cut[]> {
  const result = await databasePool().query<CutRow>(
    `select id, workspace_id, created_by_plexon_user_id, name, width, height, frame_rate, status,
            created_at, updated_at
       from cuts
      where workspace_id = $1
        and status <> 'archived'
      order by updated_at desc
      limit 100`,
    [workspaceId],
  )
  return result.rows.map(mapCut)
}

export async function findCut(cutId: string): Promise<Cut | null> {
  const result = await databasePool().query<CutRow>(
    `select id, workspace_id, created_by_plexon_user_id, name, width, height, frame_rate, status,
            created_at, updated_at
       from cuts
      where id = $1
        and status <> 'archived'`,
    [cutId],
  )
  return result.rows[0] ? mapCut(result.rows[0]) : null
}

export async function listScenesForCut(cutId: string): Promise<CutScene[]> {
  const result = await databasePool().query<CutSceneRow>(
    `select ${CUT_SCENE_SELECT}
       from cut_scenes
      where cut_id = $1
      order by timeline_start_ms asc, position asc`,
    [cutId],
  )
  return result.rows.map(mapCutScene)
}

export async function createCutWithScenes(input: {
  workspaceId: string
  createdByPlexonUserId: string
  name: string
  width?: number | null
  height?: number | null
  frameRate?: number | null
  scenes: Array<{ mediaAssetId: string; startMs: number; endMs: number; sceneKey?: string | null }>
}): Promise<{ cut: Cut; scenes: CutScene[] }> {
  const client = await databasePool().connect()
  try {
    await client.query('begin')
    const cutId = randomUUID()
    const cutResult = await client.query<CutRow>(
      `insert into cuts (
         id, workspace_id, created_by_plexon_user_id, name, width, height, frame_rate, status
       ) values ($1, $2, $3, $4, $5, $6, $7, 'draft')
       returning id, workspace_id, created_by_plexon_user_id, name, width, height, frame_rate, status,
                 created_at, updated_at`,
      [
        cutId,
        input.workspaceId,
        input.createdByPlexonUserId,
        input.name.trim(),
        input.width ?? null,
        input.height ?? null,
        input.frameRate ?? null,
      ],
    )
    const scenes: CutScene[] = []
    let timelineCursor = 0
    for (const [position, scene] of input.scenes.entries()) {
      const duration = Math.max(0, scene.endMs - scene.startMs)
      const sceneResult = await client.query<CutSceneRow>(
        `insert into cut_scenes (id, cut_id, position, media_asset_id, start_ms, end_ms, timeline_start_ms, scene_key)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning ${CUT_SCENE_SELECT}`,
        [
          randomUUID(),
          cutId,
          position,
          scene.mediaAssetId,
          scene.startMs,
          scene.endMs,
          timelineCursor,
          scene.sceneKey?.trim() || null,
        ],
      )
      scenes.push(mapCutScene(sceneResult.rows[0]))
      timelineCursor += duration
    }
    await client.query('commit')
    return { cut: mapCut(cutResult.rows[0]), scenes }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function archiveCut(cutId: string, workspaceId: string): Promise<boolean> {
  const result = await databasePool().query(
    `update cuts
        set status = 'archived',
            updated_at = now()
      where id = $1
        and workspace_id = $2`,
    [cutId, workspaceId],
  )
  return (result.rowCount ?? 0) > 0
}

const MIN_CLIP_MS = 500

export { MIN_CLIP_MS as MIN_CUT_CLIP_MS }

/**
 * Parking band above normal timeline indices.
 * Must stay >= 0 to satisfy CHECK (position >= 0); used to avoid UNIQUE collisions mid-update.
 */
export const CUT_SCENE_POSITION_PARK = 1_000_000

export function parkedPosition(position: number): number {
  return position + CUT_SCENE_POSITION_PARK
}

export function unparkShiftedPosition(parked: number, delta: number): number {
  return parked - CUT_SCENE_POSITION_PARK + delta
}

async function shiftCutScenePositionsUp(
  client: PoolClient,
  cutId: string,
  fromPosition: number,
  delta: number,
): Promise<void> {
  if (delta <= 0) return
  await client.query(
    `update cut_scenes
        set position = position + $2
      where cut_id = $1
        and position >= $3`,
    [cutId, CUT_SCENE_POSITION_PARK, fromPosition],
  )
  await client.query(
    `update cut_scenes
        set position = position - $2 + $3
      where cut_id = $1
        and position >= $2`,
    [cutId, CUT_SCENE_POSITION_PARK, delta],
  )
}

async function parkAllCutScenePositions(client: PoolClient, cutId: string): Promise<void> {
  await client.query(`update cut_scenes set position = position + $2 where cut_id = $1`, [
    cutId,
    CUT_SCENE_POSITION_PARK,
  ])
}

async function renumberCutScenes(client: PoolClient, cutId: string): Promise<void> {
  await parkAllCutScenePositions(client, cutId)
  const scenes = await client.query<{ id: string }>(
    `select id from cut_scenes where cut_id = $1 order by position asc`,
    [cutId],
  )
  for (const [position, row] of scenes.rows.entries()) {
    await client.query(`update cut_scenes set position = $2 where id = $1`, [row.id, position])
  }
  await client.query(`update cuts set updated_at = now() where id = $1`, [cutId])
}

export async function findCutScene(sceneId: string): Promise<CutScene | null> {
  const result = await databasePool().query<CutSceneRow>(
    `select ${CUT_SCENE_SELECT}
       from cut_scenes where id = $1`,
    [sceneId],
  )
  return result.rows[0] ? mapCutScene(result.rows[0]) : null
}

export async function splitCutScene(input: {
  cutId: string
  sceneId: string
  atMs: number
}): Promise<CutScene[] | null> {
  const scene = await findCutScene(input.sceneId)
  if (!scene || scene.cutId !== input.cutId) return null
  const splitAt = Math.floor(input.atMs)
  if (splitAt <= scene.startMs + MIN_CLIP_MS || splitAt >= scene.endMs - MIN_CLIP_MS) return null

  const client = await databasePool().connect()
  try {
    await client.query('begin')
    await client.query(
      `update cut_scenes
          set end_ms = $2
        where id = $1`,
      [scene.id, splitAt],
    )
    await shiftCutScenePositionsUp(client, scene.cutId, scene.position + 1, 1)
    const rightTimelineStart = scene.timelineStartMs + (splitAt - scene.startMs)
    await client.query(
      `insert into cut_scenes (id, cut_id, position, media_asset_id, start_ms, end_ms, timeline_start_ms, scene_key)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        randomUUID(),
        scene.cutId,
        scene.position + 1,
        scene.mediaAssetId,
        splitAt,
        scene.endMs,
        rightTimelineStart,
        scene.sceneKey,
      ],
    )
    await client.query(`update cuts set updated_at = now() where id = $1`, [scene.cutId])
    await client.query('commit')
    return listScenesForCut(scene.cutId)
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function mergeCutSceneWithNext(input: {
  cutId: string
  sceneId: string
}): Promise<CutScene[] | null> {
  const scenes = await listScenesForCut(input.cutId)
  const index = scenes.findIndex((scene) => scene.id === input.sceneId)
  if (index < 0 || index >= scenes.length - 1) return null
  const current = scenes[index]
  const next = scenes[index + 1]
  if (current.mediaAssetId !== next.mediaAssetId) return null

  const client = await databasePool().connect()
  try {
    await client.query('begin')
    await client.query(`update cut_scenes set end_ms = $2 where id = $1`, [current.id, next.endMs])
    await client.query(`delete from cut_scenes where id = $1`, [next.id])
    await renumberCutScenes(client, input.cutId)
    await client.query('commit')
    return listScenesForCut(input.cutId)
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function deleteCutScene(input: { cutId: string; sceneId: string }): Promise<CutScene[] | null> {
  const scene = await findCutScene(input.sceneId)
  if (!scene || scene.cutId !== input.cutId) return null

  const client = await databasePool().connect()
  try {
    await client.query('begin')
    await client.query(`delete from cut_scenes where id = $1`, [scene.id])
    await renumberCutScenes(client, input.cutId)
    await client.query('commit')
    return listScenesForCut(input.cutId)
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function trimCutScene(input: {
  cutId: string
  sceneId: string
  startMs?: number
  endMs?: number
  timelineStartMs?: number
}): Promise<CutScene[] | null> {
  const scene = await findCutScene(input.sceneId)
  if (!scene || scene.cutId !== input.cutId) return null

  const startMs = input.startMs ?? scene.startMs
  const endMs = input.endMs ?? scene.endMs
  if (endMs - startMs < MIN_CLIP_MS || startMs >= endMs) return null
  const timelineStartMs =
    typeof input.timelineStartMs === 'number' && Number.isFinite(input.timelineStartMs)
      ? Math.max(0, Math.floor(input.timelineStartMs))
      : scene.timelineStartMs

  const client = await databasePool().connect()
  try {
    await client.query('begin')
    await client.query(
      `update cut_scenes set start_ms = $2, end_ms = $3, timeline_start_ms = $4 where id = $1`,
      [scene.id, Math.floor(startMs), Math.floor(endMs), timelineStartMs],
    )
    await client.query(`update cuts set updated_at = now() where id = $1`, [input.cutId])
    await client.query('commit')
    return listScenesForCut(input.cutId)
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function moveCutScene(input: {
  cutId: string
  sceneId: string
  timelineStartMs: number
}): Promise<CutScene[] | null> {
  const scene = await findCutScene(input.sceneId)
  if (!scene || scene.cutId !== input.cutId) return null
  const timelineStartMs = Math.max(0, Math.floor(input.timelineStartMs))

  const client = await databasePool().connect()
  try {
    await client.query('begin')
    await client.query(`update cut_scenes set timeline_start_ms = $2 where id = $1`, [
      scene.id,
      timelineStartMs,
    ])
    await client.query(`update cuts set updated_at = now() where id = $1`, [input.cutId])
    await client.query('commit')
    return listScenesForCut(input.cutId)
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function rollTrimCutBoundary(input: {
  cutId: string
  leftSceneId: string
  boundaryMs: number
}): Promise<CutScene[] | null> {
  const scenes = await listScenesForCut(input.cutId)
  const index = scenes.findIndex((scene) => scene.id === input.leftSceneId)
  if (index < 0 || index >= scenes.length - 1) return null
  const left = scenes[index]
  const right = scenes[index + 1]
  if (left.mediaAssetId !== right.mediaAssetId) return null

  const boundary = Math.floor(input.boundaryMs)
  if (boundary <= left.startMs + MIN_CLIP_MS || boundary >= right.endMs - MIN_CLIP_MS) return null

  const client = await databasePool().connect()
  try {
    await client.query('begin')
    await client.query(`update cut_scenes set end_ms = $2 where id = $1`, [left.id, boundary])
    await client.query(`update cut_scenes set start_ms = $2 where id = $1`, [right.id, boundary])
    await client.query(`update cuts set updated_at = now() where id = $1`, [input.cutId])
    await client.query('commit')
    return listScenesForCut(input.cutId)
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function reorderCutScenes(input: {
  cutId: string
  sceneIds: string[]
}): Promise<CutScene[] | null> {
  const scenes = await listScenesForCut(input.cutId)
  if (scenes.length === 0 || scenes.length !== input.sceneIds.length) return null
  const existingIds = new Set(scenes.map((scene) => scene.id))
  if (input.sceneIds.some((sceneId) => !existingIds.has(sceneId))) return null
  if (new Set(input.sceneIds).size !== input.sceneIds.length) return null
  const byId = new Map(scenes.map((scene) => [scene.id, scene]))

  const client = await databasePool().connect()
  try {
    await client.query('begin')
    await parkAllCutScenePositions(client, input.cutId)
    let timelineCursor = 0
    for (const [position, sceneId] of input.sceneIds.entries()) {
      const scene = byId.get(sceneId)
      if (!scene) continue
      const duration = Math.max(0, scene.endMs - scene.startMs)
      await client.query(
        `update cut_scenes set position = $2, timeline_start_ms = $3 where id = $1 and cut_id = $4`,
        [sceneId, position, timelineCursor, input.cutId],
      )
      timelineCursor += duration
    }
    await client.query(`update cuts set updated_at = now() where id = $1`, [input.cutId])
    await client.query('commit')
    return listScenesForCut(input.cutId)
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function renameCut(input: {
  cutId: string
  workspaceId: string
  name: string
}): Promise<Cut | null> {
  const trimmed = input.name.trim()
  if (!trimmed) return null

  const result = await databasePool().query<CutRow>(
    `update cuts
        set name = $3,
            updated_at = now()
      where id = $1
        and workspace_id = $2
        and status <> 'archived'
      returning id, workspace_id, created_by_plexon_user_id, name, width, height, frame_rate, status,
                created_at, updated_at`,
    [input.cutId, input.workspaceId, trimmed],
  )
  return result.rows[0] ? mapCut(result.rows[0]) : null
}

/** Update export canvas; keeps fps when set, else defaults to 25. Spec: cut-export-extras.md */
export async function updateCutCanvas(input: {
  cutId: string
  workspaceId: string
  width: number
  height: number
  defaultFrameRate?: number
}): Promise<Cut | null> {
  const defaultFps = input.defaultFrameRate ?? 25
  const result = await databasePool().query<CutRow>(
    `update cuts
        set width = $3,
            height = $4,
            frame_rate = coalesce(frame_rate, $5),
            updated_at = now()
      where id = $1
        and workspace_id = $2
        and status <> 'archived'
      returning id, workspace_id, created_by_plexon_user_id, name, width, height, frame_rate, status,
                created_at, updated_at`,
    [input.cutId, input.workspaceId, input.width, input.height, defaultFps],
  )
  return result.rows[0] ? mapCut(result.rows[0]) : null
}

export async function addSceneToCut(input: {
  cutId: string
  mediaAssetId: string
  startMs: number
  endMs: number
  sceneKey?: string | null
  afterSceneId?: string | null
  timelineStartMs?: number
}): Promise<CutScene[] | null> {
  return addScenesToCut({
    cutId: input.cutId,
    afterSceneId: input.afterSceneId,
    timelineStartMs: input.timelineStartMs,
    scenes: [
      {
        mediaAssetId: input.mediaAssetId,
        startMs: input.startMs,
        endMs: input.endMs,
        sceneKey: input.sceneKey,
      },
    ],
  })
}

export async function addScenesToCut(input: {
  cutId: string
  afterSceneId?: string | null
  timelineStartMs?: number
  scenes: Array<{
    mediaAssetId: string
    startMs: number
    endMs: number
    sceneKey?: string | null
    timelineStartMs?: number
  }>
}): Promise<CutScene[] | null> {
  if (!input.scenes.length) return null
  const normalized: Array<{
    mediaAssetId: string
    startMs: number
    endMs: number
    sceneKey: string | null
    timelineStartMs: number | null
  }> = []
  for (const scene of input.scenes) {
    const startMs = Math.floor(scene.startMs)
    const endMs = Math.floor(scene.endMs)
    if (endMs - startMs < MIN_CLIP_MS) return null
    if (!scene.mediaAssetId.trim()) return null
    normalized.push({
      mediaAssetId: scene.mediaAssetId.trim(),
      startMs,
      endMs,
      sceneKey: scene.sceneKey?.trim() || null,
      timelineStartMs:
        typeof scene.timelineStartMs === 'number' && Number.isFinite(scene.timelineStartMs)
          ? Math.max(0, Math.floor(scene.timelineStartMs))
          : null,
    })
  }

  const client = await databasePool().connect()
  try {
    await client.query('begin')
    const locked = await client.query<{
      id: string
      position: number
      start_ms: number
      end_ms: number
      timeline_start_ms: number
    }>(
      `select id, position, start_ms, end_ms, timeline_start_ms
         from cut_scenes where cut_id = $1
         order by position asc for update`,
      [input.cutId],
    )
    let position = locked.rows.length
    if (input.afterSceneId) {
      const index = locked.rows.findIndex((scene) => scene.id === input.afterSceneId)
      if (index >= 0) position = index + 1
    }

    let timelineCursor: number
    if (typeof input.timelineStartMs === 'number' && Number.isFinite(input.timelineStartMs)) {
      timelineCursor = Math.max(0, Math.floor(input.timelineStartMs))
    } else if (input.afterSceneId) {
      const after = locked.rows.find((scene) => scene.id === input.afterSceneId)
      timelineCursor = after
        ? after.timeline_start_ms + Math.max(0, after.end_ms - after.start_ms)
        : locked.rows.reduce(
            (max, row) => Math.max(max, row.timeline_start_ms + Math.max(0, row.end_ms - row.start_ms)),
            0,
          )
    } else {
      timelineCursor = locked.rows.reduce(
        (max, row) => Math.max(max, row.timeline_start_ms + Math.max(0, row.end_ms - row.start_ms)),
        0,
      )
    }

    await shiftCutScenePositionsUp(client, input.cutId, position, normalized.length)
    for (const [offset, scene] of normalized.entries()) {
      const duration = Math.max(0, scene.endMs - scene.startMs)
      const startAt = scene.timelineStartMs ?? timelineCursor
      await client.query(
        `insert into cut_scenes (id, cut_id, position, media_asset_id, start_ms, end_ms, timeline_start_ms, scene_key)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          randomUUID(),
          input.cutId,
          position + offset,
          scene.mediaAssetId,
          scene.startMs,
          scene.endMs,
          startAt,
          scene.sceneKey,
        ],
      )
      timelineCursor = startAt + duration
    }
    await client.query(`update cuts set updated_at = now() where id = $1`, [input.cutId])
    await client.query('commit')
    return listScenesForCut(input.cutId)
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export type CutRestoreClip = {
  id: string
  trackId: string
  position: number
  mediaAssetId: string
  startMs: number
  endMs: number
  timelineStartMs: number
}

export type CutRestoreResult = {
  scenes: CutScene[]
  videoClips: Awaited<ReturnType<typeof import('./cut-video').listCutVideoClips>>
  audioClips: Awaited<ReturnType<typeof import('./cut-audio').listCutAudioClips>>
}

export async function restoreCutTimeline(input: {
  cutId: string
  scenes: Array<{
    id: string
    position: number
    mediaAssetId: string
    startMs: number
    endMs: number
    timelineStartMs?: number
    sceneKey?: string | null
    premiereFiltersXml?: string | null
  }>
  videoClips?: CutRestoreClip[]
  audioClips?: CutRestoreClip[]
}): Promise<CutRestoreResult | null> {
  if (input.scenes.length === 0) return null
  for (const scene of input.scenes) {
    if (scene.endMs - scene.startMs < MIN_CLIP_MS) return null
  }
  if (input.videoClips) {
    for (const clip of input.videoClips) {
      if (clip.endMs - clip.startMs < MIN_CLIP_MS) return null
      if (!clip.id?.trim() || !clip.trackId?.trim() || !clip.mediaAssetId?.trim()) return null
    }
  }
  if (input.audioClips) {
    for (const clip of input.audioClips) {
      if (clip.endMs - clip.startMs < MIN_CLIP_MS) return null
      if (!clip.id?.trim() || !clip.trackId?.trim() || !clip.mediaAssetId?.trim()) return null
    }
  }

  const client = await databasePool().connect()
  try {
    await client.query('begin')
    await client.query(`delete from cut_scenes where cut_id = $1`, [input.cutId])
    const ordered = [...input.scenes].sort((a, b) => a.position - b.position)
    let timelineCursor = 0
    for (const [position, scene] of ordered.entries()) {
      const duration = Math.max(0, scene.endMs - scene.startMs)
      const timelineStartMs =
        typeof scene.timelineStartMs === 'number' && Number.isFinite(scene.timelineStartMs)
          ? Math.max(0, Math.floor(scene.timelineStartMs))
          : timelineCursor
      await client.query(
        `insert into cut_scenes (
           id, cut_id, position, media_asset_id, start_ms, end_ms, timeline_start_ms, scene_key, premiere_filters_xml
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          scene.id,
          input.cutId,
          position,
          scene.mediaAssetId,
          scene.startMs,
          scene.endMs,
          timelineStartMs,
          scene.sceneKey?.trim() || null,
          scene.premiereFiltersXml?.trim() || null,
        ],
      )
      timelineCursor = timelineStartMs + duration
    }

    if (input.videoClips) {
      await client.query(`delete from cut_video_clips where cut_id = $1`, [input.cutId])
      const orderedVideo = [...input.videoClips].sort((a, b) => a.position - b.position)
      for (const [position, clip] of orderedVideo.entries()) {
        const track = await client.query<{ id: string }>(
          `select id from cut_tracks where id = $1 and cut_id = $2 and kind = 'video_overlay'`,
          [clip.trackId, input.cutId],
        )
        if (!track.rows[0]) {
          await client.query('rollback')
          return null
        }
        await client.query(
          `insert into cut_video_clips (
             id, track_id, cut_id, position, media_asset_id, timeline_start_ms, start_ms, end_ms
           ) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            clip.id,
            clip.trackId,
            input.cutId,
            position,
            clip.mediaAssetId,
            Math.max(0, Math.floor(clip.timelineStartMs)),
            Math.floor(clip.startMs),
            Math.floor(clip.endMs),
          ],
        )
      }
    }

    if (input.audioClips) {
      await client.query(`delete from cut_audio_clips where cut_id = $1`, [input.cutId])
      const orderedAudio = [...input.audioClips].sort((a, b) => a.position - b.position)
      for (const [position, clip] of orderedAudio.entries()) {
        const track = await client.query<{ id: string }>(
          `select id from cut_tracks where id = $1 and cut_id = $2 and kind = 'audio_bus'`,
          [clip.trackId, input.cutId],
        )
        if (!track.rows[0]) {
          await client.query('rollback')
          return null
        }
        await client.query(
          `insert into cut_audio_clips (
             id, track_id, cut_id, position, media_asset_id, timeline_start_ms, start_ms, end_ms
           ) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            clip.id,
            clip.trackId,
            input.cutId,
            position,
            clip.mediaAssetId,
            Math.max(0, Math.floor(clip.timelineStartMs)),
            Math.floor(clip.startMs),
            Math.floor(clip.endMs),
          ],
        )
      }
    }

    await client.query(`update cuts set updated_at = now() where id = $1`, [input.cutId])
    await client.query('commit')
    const [{ listCutVideoClips }, { listCutAudioClips }] = await Promise.all([
      import('./cut-video'),
      import('./cut-audio'),
    ])
    return {
      scenes: await listScenesForCut(input.cutId),
      videoClips: await listCutVideoClips(input.cutId),
      audioClips: await listCutAudioClips(input.cutId),
    }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}
