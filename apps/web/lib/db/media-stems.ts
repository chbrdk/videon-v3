import { randomUUID } from 'node:crypto'
import { databasePool } from './client'

export type AudioStemKind = 'voice' | 'music'

export type MediaAudioStem = {
  id: string
  mediaAssetId: string
  analysisRunId: string
  stemKind: AudioStemKind
  storageKey: string
  mimeType: string
  bytes: number
  durationMs: number | null
  peaks: number[]
  method: string
  createdAt: string
  updatedAt: string
}

type StemRow = {
  id: string
  media_asset_id: string
  analysis_run_id: string
  stem_kind: AudioStemKind
  storage_key: string
  mime_type: string
  bytes: string | number
  duration_ms: number | null
  peaks: unknown
  method: string
  created_at: Date | string
  updated_at: Date | string
}

function mapPeaks(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => (typeof entry === 'number' && Number.isFinite(entry) ? Math.min(1, Math.max(0, entry)) : 0))
    .slice(0, 512)
}

function mapStem(row: StemRow): MediaAudioStem {
  return {
    id: row.id,
    mediaAssetId: row.media_asset_id,
    analysisRunId: row.analysis_run_id,
    stemKind: row.stem_kind,
    storageKey: row.storage_key,
    mimeType: row.mime_type,
    bytes: Number(row.bytes),
    durationMs: row.duration_ms,
    peaks: mapPeaks(row.peaks),
    method: row.method,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

export async function upsertMediaAudioStem(input: {
  mediaAssetId: string
  analysisRunId: string
  stemKind: AudioStemKind
  storageKey: string
  mimeType?: string
  bytes: number
  durationMs?: number | null
  peaks?: number[]
  method: string
}): Promise<MediaAudioStem> {
  const id = randomUUID()
  const result = await databasePool().query<StemRow>(
    `insert into media_audio_stems (
       id, media_asset_id, analysis_run_id, stem_kind, storage_key, mime_type, bytes,
       duration_ms, peaks, method
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
     on conflict (media_asset_id, analysis_run_id, stem_kind)
     do update set
       storage_key = excluded.storage_key,
       mime_type = excluded.mime_type,
       bytes = excluded.bytes,
       duration_ms = excluded.duration_ms,
       peaks = excluded.peaks,
       method = excluded.method,
       updated_at = now()
     returning id, media_asset_id, analysis_run_id, stem_kind, storage_key, mime_type, bytes,
               duration_ms, peaks, method, created_at, updated_at`,
    [
      id,
      input.mediaAssetId,
      input.analysisRunId,
      input.stemKind,
      input.storageKey,
      input.mimeType ?? 'audio/wav',
      input.bytes,
      input.durationMs ?? null,
      JSON.stringify(input.peaks ?? []),
      input.method,
    ],
  )
  return mapStem(result.rows[0])
}

export async function listLatestAudioStemsForMedia(mediaAssetId: string): Promise<MediaAudioStem[]> {
  const result = await databasePool().query<StemRow>(
    `select distinct on (stem_kind)
       id, media_asset_id, analysis_run_id, stem_kind, storage_key, mime_type, bytes,
       duration_ms, peaks, method, created_at, updated_at
     from media_audio_stems
     where media_asset_id = $1
     order by stem_kind, created_at desc`,
    [mediaAssetId],
  )
  return result.rows.map(mapStem)
}

export async function listLatestAudioStemsForMediaIds(
  mediaAssetIds: string[],
): Promise<Record<string, MediaAudioStem[]>> {
  if (mediaAssetIds.length === 0) return {}
  const result = await databasePool().query<StemRow>(
    `select distinct on (media_asset_id, stem_kind)
       id, media_asset_id, analysis_run_id, stem_kind, storage_key, mime_type, bytes,
       duration_ms, peaks, method, created_at, updated_at
     from media_audio_stems
     where media_asset_id = any($1::uuid[])
     order by media_asset_id, stem_kind, created_at desc`,
    [mediaAssetIds],
  )
  const next: Record<string, MediaAudioStem[]> = {}
  for (const row of result.rows) {
    const stem = mapStem(row)
    const list = next[stem.mediaAssetId] ?? []
    list.push(stem)
    next[stem.mediaAssetId] = list
  }
  return next
}
