import { databasePool } from './client'
import type { ProvisionedWorkspace } from '@videon-v3/contracts'

export const MEDIA_LIFECYCLE_STATES = [
  'uploading',
  'uploaded',
  'processing',
  'ready',
  'failed',
  'archived',
] as const

export type MediaLifecycleState = (typeof MEDIA_LIFECYCLE_STATES)[number]

export type MediaAsset = {
  id: string
  workspaceId: string
  createdByPlexonUserId: string
  storageKey: string
  originalFilename: string
  mimeType: string
  bytes: number
  checksumSha256: string
  lifecycleState: MediaLifecycleState
  createdAt: string
  updatedAt: string
}

export type MediaAssetDetail = MediaAsset & {
  durationMs: number | null
  width: number | null
  height: number | null
  frameRate: number | null
}

type MediaRow = {
  id: string
  workspace_id: string
  created_by_plexon_user_id: string
  storage_key: string
  original_filename: string
  mime_type: string
  bytes: string | number
  checksum_sha256: string
  lifecycle_state: MediaLifecycleState
  duration_ms: number | null
  width: number | null
  height: number | null
  frame_rate: string | number | null
  created_at: Date | string
  updated_at: Date | string
}

function mapMedia(row: MediaRow): MediaAsset {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    createdByPlexonUserId: row.created_by_plexon_user_id,
    storageKey: row.storage_key,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    bytes: typeof row.bytes === 'string' ? Number(row.bytes) : row.bytes,
    checksumSha256: row.checksum_sha256,
    lifecycleState: row.lifecycle_state,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

function mapMediaDetail(row: MediaRow): MediaAssetDetail {
  return {
    ...mapMedia(row),
    durationMs: row.duration_ms,
    width: row.width,
    height: row.height,
    frameRate: row.frame_rate === null ? null : Number(row.frame_rate),
  }
}

const MEDIA_SELECT_COLUMNS = `id, workspace_id, created_by_plexon_user_id, storage_key, original_filename, mime_type,
            bytes, checksum_sha256, lifecycle_state, duration_ms, width, height, frame_rate,
            created_at, updated_at`

export async function listMediaForWorkspace(workspaceId: string): Promise<MediaAsset[]> {
  const result = await databasePool().query<MediaRow>(
    `select ${MEDIA_SELECT_COLUMNS}
       from media_assets
      where workspace_id = $1
        and lifecycle_state <> 'archived'
      order by created_at desc
      limit 200`,
    [workspaceId],
  )
  return result.rows.map(mapMedia)
}

export async function findMediaAsset(mediaAssetId: string): Promise<MediaAsset | null> {
  const result = await databasePool().query<MediaRow>(
    `select ${MEDIA_SELECT_COLUMNS}
       from media_assets
      where id = $1
        and lifecycle_state <> 'archived'`,
    [mediaAssetId],
  )
  return result.rows[0] ? mapMedia(result.rows[0]) : null
}

export async function findMediaAssetDetail(mediaAssetId: string): Promise<MediaAssetDetail | null> {
  const result = await databasePool().query<MediaRow>(
    `select ${MEDIA_SELECT_COLUMNS}
       from media_assets
      where id = $1
        and lifecycle_state <> 'archived'`,
    [mediaAssetId],
  )
  return result.rows[0] ? mapMediaDetail(result.rows[0]) : null
}

export async function deleteMediaAssetForWorkspace(
  mediaAssetId: string,
  workspaceId: string,
): Promise<{ storageKey: string } | null> {
  const client = await databasePool().connect()
  try {
    await client.query('begin')
    const media = await client.query<Pick<MediaRow, 'storage_key' | 'lifecycle_state'>>(
      `select storage_key, lifecycle_state
         from media_assets
        where id = $1
          and workspace_id = $2
          and lifecycle_state <> 'archived'
        for update`,
      [mediaAssetId, workspaceId],
    )
    if (!media.rows[0]) {
      await client.query('rollback')
      return null
    }

    await client.query(
      `update analysis_runs
          set status = 'cancelled',
              finished_at = coalesce(finished_at, now()),
              updated_at = now()
        where media_asset_id = $1
          and status in ('queued', 'running')`,
      [mediaAssetId],
    )
    await client.query(`delete from analysis_runs where media_asset_id = $1`, [mediaAssetId])
    await client.query(`delete from media_assets where id = $1 and workspace_id = $2`, [
      mediaAssetId,
      workspaceId,
    ])
    await client.query('commit')
    return { storageKey: media.rows[0].storage_key }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function createUploadingMediaAsset(input: {
  id: string
  workspace: ProvisionedWorkspace
  plexonUserId: string
  originalFilename: string
  mimeType: string
  bytes: number
  checksumSha256: string
  storageKey: string
}): Promise<MediaAsset> {
  const result = await databasePool().query<MediaRow>(
    `insert into media_assets (
       id, workspace_id, created_by_plexon_user_id, storage_key, original_filename, mime_type,
       bytes, checksum_sha256, lifecycle_state
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, 'uploading')
     returning ${MEDIA_SELECT_COLUMNS}`,
    [
      input.id,
      input.workspace.id,
      input.plexonUserId,
      input.storageKey,
      input.originalFilename,
      input.mimeType,
      input.bytes,
      input.checksumSha256.toLowerCase(),
    ],
  )
  return mapMedia(result.rows[0])
}

export async function markMediaUploaded(mediaAssetId: string, workspaceId: string): Promise<MediaAsset | null> {
  const result = await databasePool().query<MediaRow>(
    `update media_assets
        set lifecycle_state = 'uploaded',
            updated_at = now()
      where id = $1
        and workspace_id = $2
        and lifecycle_state = 'uploading'
    returning ${MEDIA_SELECT_COLUMNS}`,
    [mediaAssetId, workspaceId],
  )
  return result.rows[0] ? mapMedia(result.rows[0]) : null
}

export async function findMediaByChecksumInWorkspace(
  workspaceId: string,
  checksumSha256: string,
  excludeMediaAssetId?: string,
): Promise<MediaAsset | null> {
  const result = await databasePool().query<MediaRow>(
    `select ${MEDIA_SELECT_COLUMNS}
       from media_assets
      where workspace_id = $1
        and checksum_sha256 = $2
        and lifecycle_state <> 'archived'
        and ($3::uuid is null or id <> $3)
      limit 1`,
    [workspaceId, checksumSha256.toLowerCase(), excludeMediaAssetId ?? null],
  )
  return result.rows[0] ? mapMedia(result.rows[0]) : null
}

export async function finalizeMediaUploaded(input: {
  mediaAssetId: string
  workspaceId: string
  checksumSha256: string
}): Promise<MediaAsset | null> {
  const result = await databasePool().query<MediaRow>(
    `update media_assets
        set lifecycle_state = 'uploaded',
            checksum_sha256 = $3,
            updated_at = now()
      where id = $1
        and workspace_id = $2
        and lifecycle_state = 'uploading'
    returning ${MEDIA_SELECT_COLUMNS}`,
    [input.mediaAssetId, input.workspaceId, input.checksumSha256.toLowerCase()],
  )
  return result.rows[0] ? mapMedia(result.rows[0]) : null
}

export async function mediaSummaryForWorkspace(workspaceId: string): Promise<{
  mediaCount: number
  readyMediaCount: number
  processingMediaCount: number
  failedMediaCount: number
  lastActivityAt: string | null
}> {
  const result = await databasePool().query<{
    media_count: string
    ready_count: string
    processing_count: string
    failed_count: string
    last_activity_at: Date | string | null
  }>(
    `select
       count(*)::text as media_count,
       count(*) filter (where lifecycle_state in ('ready', 'uploaded'))::text as ready_count,
       count(*) filter (where lifecycle_state in ('uploading', 'processing'))::text as processing_count,
       count(*) filter (where lifecycle_state = 'failed')::text as failed_count,
       max(updated_at) as last_activity_at
     from media_assets
     where workspace_id = $1`,
    [workspaceId],
  )
  const row = result.rows[0]
  return {
    mediaCount: Number(row?.media_count ?? 0),
    readyMediaCount: Number(row?.ready_count ?? 0),
    processingMediaCount: Number(row?.processing_count ?? 0),
    failedMediaCount: Number(row?.failed_count ?? 0),
    lastActivityAt: row?.last_activity_at ? new Date(row.last_activity_at).toISOString() : null,
  }
}
