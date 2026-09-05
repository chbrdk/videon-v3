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
  created_at: Date | string
}

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
    `select id, cut_id, position, media_asset_id, start_ms, end_ms, created_at
       from cut_scenes
      where cut_id = $1
      order by position asc`,
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
  scenes: Array<{ mediaAssetId: string; startMs: number; endMs: number }>
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
    for (const [position, scene] of input.scenes.entries()) {
      const sceneResult = await client.query<CutSceneRow>(
        `insert into cut_scenes (id, cut_id, position, media_asset_id, start_ms, end_ms)
         values ($1, $2, $3, $4, $5, $6)
         returning id, cut_id, position, media_asset_id, start_ms, end_ms, created_at`,
        [randomUUID(), cutId, position, scene.mediaAssetId, scene.startMs, scene.endMs],
      )
      scenes.push(mapCutScene(sceneResult.rows[0]))
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

async function renumberCutScenes(client: PoolClient, cutId: string): Promise<void> {
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
    `select id, cut_id, position, media_asset_id, start_ms, end_ms, created_at
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
    await client.query(
      `insert into cut_scenes (id, cut_id, position, media_asset_id, start_ms, end_ms)
       values ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), scene.cutId, scene.position + 1, scene.mediaAssetId, splitAt, scene.endMs],
    )
    await renumberCutScenes(client, scene.cutId)
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
}): Promise<CutScene[] | null> {
  const scene = await findCutScene(input.sceneId)
  if (!scene || scene.cutId !== input.cutId) return null

  const startMs = input.startMs ?? scene.startMs
  const endMs = input.endMs ?? scene.endMs
  if (endMs - startMs < MIN_CLIP_MS || startMs >= endMs) return null

  const client = await databasePool().connect()
  try {
    await client.query('begin')
    await client.query(`update cut_scenes set start_ms = $2, end_ms = $3 where id = $1`, [
      scene.id,
      Math.floor(startMs),
      Math.floor(endMs),
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

export async function reorderCutScenes(input: {
  cutId: string
  sceneIds: string[]
}): Promise<CutScene[] | null> {
  const scenes = await listScenesForCut(input.cutId)
  if (scenes.length === 0 || scenes.length !== input.sceneIds.length) return null
  const existingIds = new Set(scenes.map((scene) => scene.id))
  if (input.sceneIds.some((sceneId) => !existingIds.has(sceneId))) return null
  if (new Set(input.sceneIds).size !== input.sceneIds.length) return null

  const client = await databasePool().connect()
  try {
    await client.query('begin')
    for (const [position, sceneId] of input.sceneIds.entries()) {
      await client.query(`update cut_scenes set position = $2 where id = $1 and cut_id = $3`, [
        sceneId,
        position,
        input.cutId,
      ])
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
