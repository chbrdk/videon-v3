import { randomUUID } from 'node:crypto'
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
