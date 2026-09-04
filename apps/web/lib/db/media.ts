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

export async function listMediaForWorkspace(workspaceId: string): Promise<MediaAsset[]> {
  const result = await databasePool().query<MediaRow>(
    `select id, workspace_id, created_by_plexon_user_id, storage_key, original_filename, mime_type,
            bytes, checksum_sha256, lifecycle_state, created_at, updated_at
       from media_assets
      where workspace_id = $1
      order by created_at desc
      limit 200`,
    [workspaceId],
  )
  return result.rows.map(mapMedia)
}

export async function findMediaAsset(mediaAssetId: string): Promise<MediaAsset | null> {
  const result = await databasePool().query<MediaRow>(
    `select id, workspace_id, created_by_plexon_user_id, storage_key, original_filename, mime_type,
            bytes, checksum_sha256, lifecycle_state, created_at, updated_at
       from media_assets
      where id = $1`,
    [mediaAssetId],
  )
  return result.rows[0] ? mapMedia(result.rows[0]) : null
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
     returning id, workspace_id, created_by_plexon_user_id, storage_key, original_filename, mime_type,
               bytes, checksum_sha256, lifecycle_state, created_at, updated_at`,
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
    returning id, workspace_id, created_by_plexon_user_id, storage_key, original_filename, mime_type,
              bytes, checksum_sha256, lifecycle_state, created_at, updated_at`,
    [mediaAssetId, workspaceId],
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
