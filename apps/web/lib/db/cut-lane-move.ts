import { randomUUID } from 'node:crypto'
import { databasePool } from './client'
import { CUT_SCENE_POSITION_PARK, listScenesForCut, type CutScene } from './cuts'
import { ensureDefaultVideoOverlayTrack } from './cut-audio'
import { listCutVideoClips, type CutVideoClip } from './cut-video'

const MIN_CLIP_MS = 500

export type LaneMoveResult = {
  scenes: CutScene[]
  videoClips: CutVideoClip[]
}

async function renumberScenes(client: {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<{ id: string }> }>
}, cutId: string): Promise<void> {
  await client.query(`update cut_scenes set position = position + $2 where cut_id = $1`, [
    cutId,
    CUT_SCENE_POSITION_PARK,
  ])
  const scenes = await client.query(`select id from cut_scenes where cut_id = $1 order by position asc`, [
    cutId,
  ])
  for (const [position, row] of scenes.rows.entries()) {
    await client.query(`update cut_scenes set position = $2 where id = $1`, [row.id, position])
  }
}

async function renumberVideoClips(client: {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<{ id: string }> }>
}, trackId: string): Promise<void> {
  await client.query(`update cut_video_clips set position = position + $2 where track_id = $1`, [
    trackId,
    CUT_SCENE_POSITION_PARK,
  ])
  const rows = await client.query(
    `select id from cut_video_clips where track_id = $1 order by position asc`,
    [trackId],
  )
  for (const [position, row] of rows.rows.entries()) {
    await client.query(`update cut_video_clips set position = $2 where id = $1`, [row.id, position])
  }
}

/** Move a V1 scene onto the V2 overlay track (requires ≥2 V1 scenes). */
export async function moveSceneToVideoOverlay(input: {
  cutId: string
  sceneId: string
  timelineStartMs?: number
}): Promise<LaneMoveResult | null> {
  const scenes = await listScenesForCut(input.cutId)
  if (scenes.length <= 1) return null
  const scene = scenes.find((entry) => entry.id === input.sceneId)
  if (!scene) return null
  const duration = scene.endMs - scene.startMs
  if (duration < MIN_CLIP_MS) return null

  const track = await ensureDefaultVideoOverlayTrack(input.cutId)
  const timelineStartMs =
    typeof input.timelineStartMs === 'number' && Number.isFinite(input.timelineStartMs)
      ? Math.max(0, Math.floor(input.timelineStartMs))
      : scene.timelineStartMs

  const client = await databasePool().connect()
  try {
    await client.query('begin')
    await client.query(`delete from cut_scenes where id = $1 and cut_id = $2`, [scene.id, input.cutId])
    await renumberScenes(client, input.cutId)

    const count = await client.query<{ n: string }>(
      `select count(*)::text as n from cut_video_clips where track_id = $1`,
      [track.id],
    )
    const position = Number(count.rows[0]?.n ?? 0)
    await client.query(
      `insert into cut_video_clips (
         id, track_id, cut_id, position, media_asset_id, timeline_start_ms, start_ms, end_ms
       ) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        randomUUID(),
        track.id,
        input.cutId,
        position,
        scene.mediaAssetId,
        timelineStartMs,
        scene.startMs,
        scene.endMs,
      ],
    )
    await client.query(`update cuts set updated_at = now() where id = $1`, [input.cutId])
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }

  return {
    scenes: await listScenesForCut(input.cutId),
    videoClips: await listCutVideoClips(input.cutId),
  }
}

/** Move a V2 overlay clip onto the V1 main track. */
export async function moveVideoOverlayToScene(input: {
  cutId: string
  videoClipId: string
  timelineStartMs?: number
}): Promise<LaneMoveResult | null> {
  const clips = await listCutVideoClips(input.cutId)
  const clip = clips.find((entry) => entry.id === input.videoClipId)
  if (!clip) return null
  const duration = clip.endMs - clip.startMs
  if (duration < MIN_CLIP_MS) return null

  const timelineStartMs =
    typeof input.timelineStartMs === 'number' && Number.isFinite(input.timelineStartMs)
      ? Math.max(0, Math.floor(input.timelineStartMs))
      : clip.timelineStartMs

  const client = await databasePool().connect()
  try {
    await client.query('begin')
    const deleted = await client.query<{ track_id: string }>(
      `delete from cut_video_clips where id = $1 and cut_id = $2 returning track_id`,
      [clip.id, input.cutId],
    )
    if (!deleted.rows[0]) {
      await client.query('rollback')
      return null
    }
    await renumberVideoClips(client, deleted.rows[0].track_id)

    const count = await client.query<{ n: string }>(
      `select count(*)::text as n from cut_scenes where cut_id = $1`,
      [input.cutId],
    )
    const position = Number(count.rows[0]?.n ?? 0)
    await client.query(
      `insert into cut_scenes (
         id, cut_id, position, media_asset_id, start_ms, end_ms, timeline_start_ms, scene_key
       ) values ($1,$2,$3,$4,$5,$6,$7,null)`,
      [
        randomUUID(),
        input.cutId,
        position,
        clip.mediaAssetId,
        clip.startMs,
        clip.endMs,
        timelineStartMs,
      ],
    )
    await client.query(`update cuts set updated_at = now() where id = $1`, [input.cutId])
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }

  return {
    scenes: await listScenesForCut(input.cutId),
    videoClips: await listCutVideoClips(input.cutId),
  }
}
