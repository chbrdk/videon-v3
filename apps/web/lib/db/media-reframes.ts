import { createHash, randomUUID } from 'node:crypto'
import { databasePool } from './client'

export type MediaReframeStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
export type MediaReframeAspect = '9:16' | '16:9' | '1:1' | 'custom'
export type MediaReframeSaliencyModel = 'robust_v1'

export type MediaReframe = {
  id: string
  mediaAssetId: string
  workspaceId: string
  requestedByPlexonUserId: string
  aspectRatio: MediaReframeAspect
  customWidth: number | null
  customHeight: number | null
  smoothingFactor: number
  saliencyModel: MediaReframeSaliencyModel
  status: MediaReframeStatus
  progressPercent: number | null
  storageKey: string | null
  bytes: number | null
  errorMessage: string | null
  idempotencyKey: string
  createdAt: string
  updatedAt: string
}

type MediaReframeRow = {
  id: string
  media_asset_id: string
  workspace_id: string
  requested_by_plexon_user_id: string
  aspect_ratio: MediaReframeAspect
  custom_width: number | null
  custom_height: number | null
  smoothing_factor: number
  saliency_model: MediaReframeSaliencyModel
  status: MediaReframeStatus
  progress_percent: number | null
  storage_key: string | null
  bytes: string | number | null
  error_message: string | null
  idempotency_key: string
  created_at: Date | string
  updated_at: Date | string
}

const SELECT_COLUMNS = `id, media_asset_id, workspace_id, requested_by_plexon_user_id, aspect_ratio,
            custom_width, custom_height, smoothing_factor, saliency_model, status, progress_percent,
            storage_key, bytes, error_message, idempotency_key, created_at, updated_at`

function mapReframe(row: MediaReframeRow): MediaReframe {
  return {
    id: row.id,
    mediaAssetId: row.media_asset_id,
    workspaceId: row.workspace_id,
    requestedByPlexonUserId: row.requested_by_plexon_user_id,
    aspectRatio: row.aspect_ratio,
    customWidth: row.custom_width,
    customHeight: row.custom_height,
    smoothingFactor: Number(row.smoothing_factor),
    saliencyModel: row.saliency_model,
    status: row.status,
    progressPercent: row.progress_percent,
    storageKey: row.storage_key,
    bytes: row.bytes === null ? null : Number(row.bytes),
    errorMessage: row.error_message,
    idempotencyKey: row.idempotency_key,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

export function buildReframeIdempotencyKey(input: {
  mediaAssetId: string
  aspectRatio: MediaReframeAspect
  customWidth?: number | null
  customHeight?: number | null
  smoothingFactor: number
  saliencyModel: MediaReframeSaliencyModel
}): string {
  const payload = [
    input.mediaAssetId,
    input.aspectRatio,
    input.customWidth ?? '',
    input.customHeight ?? '',
    input.smoothingFactor.toFixed(3),
    input.saliencyModel,
  ].join('|')
  return `reframe:${createHash('sha256').update(payload).digest('hex').slice(0, 32)}`
}

export async function createMediaReframe(input: {
  mediaAssetId: string
  workspaceId: string
  requestedByPlexonUserId: string
  aspectRatio: MediaReframeAspect
  customWidth?: number | null
  customHeight?: number | null
  smoothingFactor?: number
  saliencyModel?: MediaReframeSaliencyModel
  idempotencyKey: string
}): Promise<MediaReframe> {
  const id = randomUUID()
  const result = await databasePool().query<MediaReframeRow>(
    `insert into media_reframes (
       id, media_asset_id, workspace_id, requested_by_plexon_user_id, aspect_ratio,
       custom_width, custom_height, smoothing_factor, saliency_model, status, idempotency_key
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'queued', $10)
     on conflict (idempotency_key)
     do update set updated_at = media_reframes.updated_at
     returning ${SELECT_COLUMNS}`,
    [
      id,
      input.mediaAssetId,
      input.workspaceId,
      input.requestedByPlexonUserId,
      input.aspectRatio,
      input.customWidth ?? null,
      input.customHeight ?? null,
      input.smoothingFactor ?? 0.3,
      input.saliencyModel ?? 'robust_v1',
      input.idempotencyKey,
    ],
  )
  return mapReframe(result.rows[0])
}

export async function findMediaReframe(reframeId: string): Promise<MediaReframe | null> {
  const result = await databasePool().query<MediaReframeRow>(
    `select ${SELECT_COLUMNS}
       from media_reframes
      where id = $1`,
    [reframeId],
  )
  return result.rows[0] ? mapReframe(result.rows[0]) : null
}

export async function listMediaReframesForMedia(mediaAssetId: string): Promise<MediaReframe[]> {
  const result = await databasePool().query<MediaReframeRow>(
    `select ${SELECT_COLUMNS}
       from media_reframes
      where media_asset_id = $1
      order by created_at desc
      limit 50`,
    [mediaAssetId],
  )
  return result.rows.map(mapReframe)
}

export async function markMediaReframeRunning(reframeId: string): Promise<void> {
  await databasePool().query(
    `update media_reframes
        set status = 'running',
            progress_percent = coalesce(progress_percent, 0),
            updated_at = now()
      where id = $1
        and status in ('queued', 'running')`,
    [reframeId],
  )
}

export async function markMediaReframeProgress(reframeId: string, progressPercent: number): Promise<void> {
  await databasePool().query(
    `update media_reframes
        set progress_percent = $2,
            updated_at = now()
      where id = $1
        and status = 'running'`,
    [reframeId, Math.max(0, Math.min(100, Math.floor(progressPercent)))],
  )
}

export async function markMediaReframeSucceeded(input: {
  reframeId: string
  storageKey: string
  bytes: number
}): Promise<void> {
  await databasePool().query(
    `update media_reframes
        set status = 'succeeded',
            storage_key = $2,
            bytes = $3,
            progress_percent = 100,
            error_message = null,
            updated_at = now()
      where id = $1`,
    [input.reframeId, input.storageKey, input.bytes],
  )
}

export async function markMediaReframeFailed(reframeId: string, errorMessage: string): Promise<void> {
  await databasePool().query(
    `update media_reframes
        set status = 'failed',
            error_message = $2,
            updated_at = now()
      where id = $1`,
    [reframeId, errorMessage.slice(0, 2000)],
  )
}
