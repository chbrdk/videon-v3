import { randomUUID } from 'node:crypto'
import { databasePool } from './client'

export type TranscriptStatus = 'pending' | 'ready' | 'skipped' | 'failed'

export type MediaTranscript = {
  id: string
  mediaAssetId: string
  analysisRunId: string
  language: string
  status: TranscriptStatus
  transcriptText: string | null
  segments: unknown[]
  createdAt: string
  updatedAt: string
}

type TranscriptRow = {
  id: string
  media_asset_id: string
  analysis_run_id: string
  language: string
  status: TranscriptStatus
  transcript_text: string | null
  segments: unknown
  created_at: Date | string
  updated_at: Date | string
}

function mapTranscript(row: TranscriptRow): MediaTranscript {
  return {
    id: row.id,
    mediaAssetId: row.media_asset_id,
    analysisRunId: row.analysis_run_id,
    language: row.language,
    status: row.status,
    transcriptText: row.transcript_text,
    segments: Array.isArray(row.segments) ? row.segments : [],
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

export async function upsertMediaTranscript(input: {
  mediaAssetId: string
  analysisRunId: string
  language?: string
  status: TranscriptStatus
  transcriptText?: string | null
  segments?: unknown[]
}): Promise<MediaTranscript> {
  const id = randomUUID()
  const result = await databasePool().query<TranscriptRow>(
    `insert into media_transcripts (
       id, media_asset_id, analysis_run_id, language, status, transcript_text, segments
     ) values ($1, $2, $3, $4, $5, $6, $7::jsonb)
     on conflict (analysis_run_id)
     do update set
       status = excluded.status,
       transcript_text = excluded.transcript_text,
       segments = excluded.segments,
       updated_at = now()
     returning id, media_asset_id, analysis_run_id, language, status, transcript_text, segments,
               created_at, updated_at`,
    [
      id,
      input.mediaAssetId,
      input.analysisRunId,
      input.language ?? 'de',
      input.status,
      input.transcriptText ?? null,
      JSON.stringify(input.segments ?? []),
    ],
  )
  return mapTranscript(result.rows[0])
}

export async function findLatestTranscriptForMedia(mediaAssetId: string): Promise<MediaTranscript | null> {
  const result = await databasePool().query<TranscriptRow>(
    `select id, media_asset_id, analysis_run_id, language, status, transcript_text, segments,
            created_at, updated_at
       from media_transcripts
      where media_asset_id = $1
      order by created_at desc
      limit 1`,
    [mediaAssetId],
  )
  return result.rows[0] ? mapTranscript(result.rows[0]) : null
}
