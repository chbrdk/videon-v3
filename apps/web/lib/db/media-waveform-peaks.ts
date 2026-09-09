import { randomUUID } from 'node:crypto'
import { databasePool } from './client'

export type MediaWaveformPeaks = {
  id: string
  mediaAssetId: string
  analysisRunId: string
  peaks: number[]
  buckets: number
  method: string
  createdAt: string
  updatedAt: string
}

type PeakRow = {
  id: string
  media_asset_id: string
  analysis_run_id: string
  peaks: unknown
  buckets: number
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

function mapRow(row: PeakRow): MediaWaveformPeaks {
  return {
    id: row.id,
    mediaAssetId: row.media_asset_id,
    analysisRunId: row.analysis_run_id,
    peaks: mapPeaks(row.peaks),
    buckets: row.buckets,
    method: row.method,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

export async function upsertMediaWaveformPeaks(input: {
  mediaAssetId: string
  analysisRunId: string
  peaks: number[]
  buckets?: number
  method: string
}): Promise<MediaWaveformPeaks> {
  const id = randomUUID()
  const buckets = input.buckets ?? 240
  const result = await databasePool().query<PeakRow>(
    `insert into media_waveform_peaks (
       id, media_asset_id, analysis_run_id, peaks, buckets, method
     ) values ($1, $2, $3, $4::jsonb, $5, $6)
     on conflict (media_asset_id, analysis_run_id)
     do update set
       peaks = excluded.peaks,
       buckets = excluded.buckets,
       method = excluded.method,
       updated_at = now()
     returning id, media_asset_id, analysis_run_id, peaks, buckets, method, created_at, updated_at`,
    [id, input.mediaAssetId, input.analysisRunId, JSON.stringify(input.peaks), buckets, input.method],
  )
  return mapRow(result.rows[0])
}

export async function findLatestWaveformPeaksForMedia(
  mediaAssetId: string,
): Promise<MediaWaveformPeaks | null> {
  const result = await databasePool().query<PeakRow>(
    `select id, media_asset_id, analysis_run_id, peaks, buckets, method, created_at, updated_at
     from media_waveform_peaks
     where media_asset_id = $1
     order by created_at desc
     limit 1`,
    [mediaAssetId],
  )
  return result.rows[0] ? mapRow(result.rows[0]) : null
}

export async function listLatestWaveformPeaksForMediaIds(
  mediaAssetIds: string[],
): Promise<Record<string, MediaWaveformPeaks>> {
  if (mediaAssetIds.length === 0) return {}
  const result = await databasePool().query<PeakRow>(
    `select distinct on (media_asset_id)
       id, media_asset_id, analysis_run_id, peaks, buckets, method, created_at, updated_at
     from media_waveform_peaks
     where media_asset_id = any($1::uuid[])
     order by media_asset_id, created_at desc`,
    [mediaAssetIds],
  )
  const next: Record<string, MediaWaveformPeaks> = {}
  for (const row of result.rows) {
    const mapped = mapRow(row)
    next[mapped.mediaAssetId] = mapped
  }
  return next
}
