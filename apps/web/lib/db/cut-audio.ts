import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { databasePool } from './client'
import { CUT_SCENE_POSITION_PARK } from './cuts'

const MIN_CLIP_MS = 500

export type CutTrackKind = 'audio_bus' | 'video_overlay'

export type CutTrack = {
  id: string
  cutId: string
  kind: CutTrackKind
  trackIndex: number
  name: string
  muted: boolean
  createdAt: string
}

export type CutAudioClip = {
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

type TrackRow = {
  id: string
  cut_id: string
  kind: CutTrackKind
  track_index: number
  name: string
  muted: boolean
  created_at: string
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

function mapTrack(row: TrackRow): CutTrack {
  return {
    id: row.id,
    cutId: row.cut_id,
    kind: row.kind,
    trackIndex: row.track_index,
    name: row.name,
    muted: row.muted,
    createdAt: row.created_at,
  }
}

function mapClip(row: ClipRow): CutAudioClip {
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

export async function ensureDefaultAudioBusTrack(cutId: string): Promise<CutTrack> {
  const existing = await databasePool().query<TrackRow>(
    `select id, cut_id, kind, track_index, name, muted, created_at
       from cut_tracks
      where cut_id = $1 and kind = 'audio_bus'
      order by track_index asc
      limit 1`,
    [cutId],
  )
  if (existing.rows[0]) return mapTrack(existing.rows[0])

  const id = randomUUID()
  const inserted = await databasePool().query<TrackRow>(
    `insert into cut_tracks (id, cut_id, kind, track_index, name, muted)
     values ($1, $2, 'audio_bus', 0, 'Voice-Over', false)
     on conflict (cut_id, kind, track_index) do update set name = cut_tracks.name
     returning id, cut_id, kind, track_index, name, muted, created_at`,
    [id, cutId],
  )
  return mapTrack(inserted.rows[0]!)
}

export async function ensureDefaultVideoOverlayTrack(cutId: string): Promise<CutTrack> {
  const existing = await databasePool().query<TrackRow>(
    `select id, cut_id, kind, track_index, name, muted, created_at
       from cut_tracks
      where cut_id = $1 and kind = 'video_overlay'
      order by track_index asc
      limit 1`,
    [cutId],
  )
  if (existing.rows[0]) return mapTrack(existing.rows[0])

  const id = randomUUID()
  const inserted = await databasePool().query<TrackRow>(
    `insert into cut_tracks (id, cut_id, kind, track_index, name, muted)
     values ($1, $2, 'video_overlay', 0, 'V2', false)
     on conflict (cut_id, kind, track_index) do update set name = cut_tracks.name
     returning id, cut_id, kind, track_index, name, muted, created_at`,
    [id, cutId],
  )
  return mapTrack(inserted.rows[0]!)
}

export async function listCutTracks(cutId: string): Promise<CutTrack[]> {
  await ensureDefaultAudioBusTrack(cutId)
  await ensureDefaultVideoOverlayTrack(cutId)
  const result = await databasePool().query<TrackRow>(
    `select id, cut_id, kind, track_index, name, muted, created_at
       from cut_tracks where cut_id = $1
      order by case kind when 'video_overlay' then 0 when 'audio_bus' then 1 else 2 end, track_index asc`,
    [cutId],
  )
  return result.rows.map(mapTrack)
}

export async function listCutAudioClips(cutId: string): Promise<CutAudioClip[]> {
  const result = await databasePool().query<ClipRow>(
    `select id, track_id, cut_id, position, media_asset_id, timeline_start_ms, start_ms, end_ms, created_at
       from cut_audio_clips where cut_id = $1 order by track_id, position asc`,
    [cutId],
  )
  return result.rows.map(mapClip)
}

export async function setCutTrackMuted(input: {
  cutId: string
  trackId: string
  muted: boolean
}): Promise<CutTrack[] | null> {
  const result = await databasePool().query(
    `update cut_tracks set muted = $3 where id = $1 and cut_id = $2`,
    [input.trackId, input.cutId, input.muted],
  )
  if ((result.rowCount ?? 0) === 0) return null
  return listCutTracks(input.cutId)
}

export async function addCutAudioClip(input: {
  cutId: string
  trackId?: string | null
  mediaAssetId: string
  startMs: number
  endMs: number
  timelineStartMs?: number
}): Promise<CutAudioClip[] | null> {
  const startMs = Math.floor(input.startMs)
  const endMs = Math.floor(input.endMs)
  if (endMs - startMs < MIN_CLIP_MS) return null
  const timelineStartMs = Math.max(0, Math.floor(input.timelineStartMs ?? 0))

  const track =
    input.trackId != null && input.trackId.trim()
      ? (
          await databasePool().query<TrackRow>(
            `select id, cut_id, kind, track_index, name, muted, created_at from cut_tracks where id = $1 and cut_id = $2`,
            [input.trackId.trim(), input.cutId],
          )
        ).rows[0]
      : null
  const bus = track ? mapTrack(track) : await ensureDefaultAudioBusTrack(input.cutId)

  const count = await databasePool().query<{ n: string }>(
    `select count(*)::text as n from cut_audio_clips where track_id = $1`,
    [bus.id],
  )
  const position = Number(count.rows[0]?.n ?? 0)

  await databasePool().query(
    `insert into cut_audio_clips (
       id, track_id, cut_id, position, media_asset_id, timeline_start_ms, start_ms, end_ms
     ) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [randomUUID(), bus.id, input.cutId, position, input.mediaAssetId.trim(), timelineStartMs, startMs, endMs],
  )
  await databasePool().query(`update cuts set updated_at = now() where id = $1`, [input.cutId])
  return listCutAudioClips(input.cutId)
}

export async function trimCutAudioClip(input: {
  cutId: string
  audioClipId: string
  startMs?: number
  endMs?: number
}): Promise<CutAudioClip[] | null> {
  const current = await databasePool().query<ClipRow>(
    `select id, track_id, cut_id, position, media_asset_id, timeline_start_ms, start_ms, end_ms, created_at
       from cut_audio_clips where id = $1 and cut_id = $2`,
    [input.audioClipId, input.cutId],
  )
  const row = current.rows[0]
  if (!row) return null
  const startMs = Math.floor(input.startMs ?? row.start_ms)
  const endMs = Math.floor(input.endMs ?? row.end_ms)
  if (endMs - startMs < MIN_CLIP_MS) return null
  await databasePool().query(`update cut_audio_clips set start_ms = $2, end_ms = $3 where id = $1`, [
    row.id,
    startMs,
    endMs,
  ])
  await databasePool().query(`update cuts set updated_at = now() where id = $1`, [input.cutId])
  return listCutAudioClips(input.cutId)
}

export async function moveCutAudioClip(input: {
  cutId: string
  audioClipId: string
  timelineStartMs: number
}): Promise<CutAudioClip[] | null> {
  const timelineStartMs = Math.max(0, Math.floor(input.timelineStartMs))
  const result = await databasePool().query(
    `update cut_audio_clips set timeline_start_ms = $3 where id = $1 and cut_id = $2`,
    [input.audioClipId, input.cutId, timelineStartMs],
  )
  if ((result.rowCount ?? 0) === 0) return null
  await databasePool().query(`update cuts set updated_at = now() where id = $1`, [input.cutId])
  return listCutAudioClips(input.cutId)
}

export async function deleteCutAudioClip(input: {
  cutId: string
  audioClipId: string
}): Promise<CutAudioClip[] | null> {
  const client = await databasePool().connect()
  try {
    await client.query('begin')
    const found = await client.query<{ track_id: string }>(
      `delete from cut_audio_clips where id = $1 and cut_id = $2 returning track_id`,
      [input.audioClipId, input.cutId],
    )
    if (!found.rows[0]) {
      await client.query('rollback')
      return null
    }
    await renumberAudioClips(client, found.rows[0].track_id)
    await client.query(`update cuts set updated_at = now() where id = $1`, [input.cutId])
    await client.query('commit')
    return listCutAudioClips(input.cutId)
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

async function renumberAudioClips(client: PoolClient, trackId: string): Promise<void> {
  await client.query(`update cut_audio_clips set position = position + $2 where track_id = $1`, [
    trackId,
    CUT_SCENE_POSITION_PARK,
  ])
  const rows = await client.query<{ id: string }>(
    `select id from cut_audio_clips where track_id = $1 order by position asc`,
    [trackId],
  )
  for (const [position, row] of rows.rows.entries()) {
    await client.query(`update cut_audio_clips set position = $2 where id = $1`, [row.id, position])
  }
}
