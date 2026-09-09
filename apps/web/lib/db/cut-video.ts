import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { databasePool } from './client'
import { CUT_SCENE_POSITION_PARK } from './cuts'
import {
  ensureDefaultVideoOverlayTrack,
  type CutTrack,
  type CutTrackKind,
} from './cut-audio'

const MIN_CLIP_MS = 500

export type CutVideoClip = {
  id: string
  trackId: string
  cutId: string
  position: number
  mediaAssetId: string
  timelineStartMs: number
  startMs: number
  endMs: number
  createdAt: string
}

type ClipRow = {
  id: string
  track_id: string
  cut_id: string
  position: number
  media_asset_id: string
  timeline_start_ms: number
  start_ms: number
  end_ms: number
  created_at: string
}

function mapClip(row: ClipRow): CutVideoClip {
  return {
    id: row.id,
    trackId: row.track_id,
    cutId: row.cut_id,
    position: row.position,
    mediaAssetId: row.media_asset_id,
    timelineStartMs: row.timeline_start_ms,
    startMs: row.start_ms,
    endMs: row.end_ms,
    createdAt: row.created_at,
  }
}

export async function listCutVideoClips(cutId: string): Promise<CutVideoClip[]> {
  const result = await databasePool().query<ClipRow>(
    `select id, track_id, cut_id, position, media_asset_id, timeline_start_ms, start_ms, end_ms, created_at
       from cut_video_clips where cut_id = $1 order by track_id, position asc`,
    [cutId],
  )
  return result.rows.map(mapClip)
}

export async function addCutVideoClip(input: {
  cutId: string
  trackId?: string | null
  mediaAssetId: string
  startMs: number
  endMs: number
  timelineStartMs?: number
}): Promise<CutVideoClip[] | null> {
  const startMs = Math.floor(input.startMs)
  const endMs = Math.floor(input.endMs)
  if (endMs - startMs < MIN_CLIP_MS) return null
  const timelineStartMs = Math.max(0, Math.floor(input.timelineStartMs ?? 0))

  let track: CutTrack
  if (input.trackId != null && input.trackId.trim()) {
    const found = await databasePool().query<{
      id: string
      cut_id: string
      kind: CutTrackKind
      track_index: number
      name: string
      muted: boolean
      created_at: string
    }>(
      `select id, cut_id, kind, track_index, name, muted, created_at
         from cut_tracks where id = $1 and cut_id = $2 and kind = 'video_overlay'`,
      [input.trackId.trim(), input.cutId],
    )
    if (!found.rows[0]) return null
    const row = found.rows[0]
    track = {
      id: row.id,
      cutId: row.cut_id,
      kind: row.kind,
      trackIndex: row.track_index,
      name: row.name,
      muted: row.muted,
      createdAt: row.created_at,
    }
  } else {
    track = await ensureDefaultVideoOverlayTrack(input.cutId)
  }

  const count = await databasePool().query<{ n: string }>(
    `select count(*)::text as n from cut_video_clips where track_id = $1`,
    [track.id],
  )
  const position = Number(count.rows[0]?.n ?? 0)

  await databasePool().query(
    `insert into cut_video_clips (
       id, track_id, cut_id, position, media_asset_id, timeline_start_ms, start_ms, end_ms
     ) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [randomUUID(), track.id, input.cutId, position, input.mediaAssetId.trim(), timelineStartMs, startMs, endMs],
  )
  await databasePool().query(`update cuts set updated_at = now() where id = $1`, [input.cutId])
  return listCutVideoClips(input.cutId)
}

export async function trimCutVideoClip(input: {
  cutId: string
  videoClipId: string
  startMs?: number
  endMs?: number
  timelineStartMs?: number
}): Promise<CutVideoClip[] | null> {
  const current = await databasePool().query<ClipRow>(
    `select id, track_id, cut_id, position, media_asset_id, timeline_start_ms, start_ms, end_ms, created_at
       from cut_video_clips where id = $1 and cut_id = $2`,
    [input.videoClipId, input.cutId],
  )
  const row = current.rows[0]
  if (!row) return null
  const startMs = Math.floor(input.startMs ?? row.start_ms)
  const endMs = Math.floor(input.endMs ?? row.end_ms)
  if (endMs - startMs < MIN_CLIP_MS) return null
  const timelineStartMs =
    typeof input.timelineStartMs === 'number' && Number.isFinite(input.timelineStartMs)
      ? Math.max(0, Math.floor(input.timelineStartMs))
      : row.timeline_start_ms
  await databasePool().query(
    `update cut_video_clips set start_ms = $2, end_ms = $3, timeline_start_ms = $4 where id = $1`,
    [row.id, startMs, endMs, timelineStartMs],
  )
  await databasePool().query(`update cuts set updated_at = now() where id = $1`, [input.cutId])
  return listCutVideoClips(input.cutId)
}

export async function moveCutVideoClip(input: {
  cutId: string
  videoClipId: string
  timelineStartMs: number
}): Promise<CutVideoClip[] | null> {
  const timelineStartMs = Math.max(0, Math.floor(input.timelineStartMs))
  const result = await databasePool().query(
    `update cut_video_clips set timeline_start_ms = $3 where id = $1 and cut_id = $2`,
    [input.videoClipId, input.cutId, timelineStartMs],
  )
  if ((result.rowCount ?? 0) === 0) return null
  await databasePool().query(`update cuts set updated_at = now() where id = $1`, [input.cutId])
  return listCutVideoClips(input.cutId)
}

export async function deleteCutVideoClip(input: {
  cutId: string
  videoClipId: string
}): Promise<CutVideoClip[] | null> {
  const client = await databasePool().connect()
  try {
    await client.query('begin')
    const found = await client.query<{ track_id: string }>(
      `delete from cut_video_clips where id = $1 and cut_id = $2 returning track_id`,
      [input.videoClipId, input.cutId],
    )
    if (!found.rows[0]) {
      await client.query('rollback')
      return null
    }
    await renumberVideoClips(client, found.rows[0].track_id)
    await client.query(`update cuts set updated_at = now() where id = $1`, [input.cutId])
    await client.query('commit')
    return listCutVideoClips(input.cutId)
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

async function renumberVideoClips(client: PoolClient, trackId: string): Promise<void> {
  await client.query(`update cut_video_clips set position = position + $2 where track_id = $1`, [
    trackId,
    CUT_SCENE_POSITION_PARK,
  ])
  const rows = await client.query<{ id: string }>(
    `select id from cut_video_clips where track_id = $1 order by position asc`,
    [trackId],
  )
  for (const [position, row] of rows.rows.entries()) {
    await client.query(`update cut_video_clips set position = $2 where id = $1`, [row.id, position])
  }
}
