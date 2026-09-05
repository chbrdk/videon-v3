import { databasePool } from './client'
import type { MediaAsset, MediaLifecycleState } from './media'

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

export async function markMediaProcessing(mediaAssetId: string, workspaceId: string): Promise<MediaAsset | null> {
  const result = await databasePool().query<MediaRow>(
    `update media_assets
        set lifecycle_state = 'processing',
            updated_at = now()
      where id = $1
        and workspace_id = $2
        and lifecycle_state in ('uploaded', 'processing')
    returning id, workspace_id, created_by_plexon_user_id, storage_key, original_filename, mime_type,
              bytes, checksum_sha256, lifecycle_state, created_at, updated_at`,
    [mediaAssetId, workspaceId],
  )
  return result.rows[0] ? mapMedia(result.rows[0]) : null
}

export async function updateMediaProbe(input: {
  mediaAssetId: string
  workspaceId: string
  durationMs: number
  width: number | null
  height: number | null
  frameRate: number | null
}): Promise<void> {
  await databasePool().query(
    `update media_assets
        set duration_ms = $3,
            width = $4,
            height = $5,
            frame_rate = $6,
            updated_at = now()
      where id = $1
        and workspace_id = $2`,
    [
      input.mediaAssetId,
      input.workspaceId,
      input.durationMs,
      input.width,
      input.height,
      input.frameRate,
    ],
  )
}

export async function markMediaReady(mediaAssetId: string, workspaceId: string): Promise<MediaAsset | null> {
  const result = await databasePool().query<MediaRow>(
    `update media_assets
        set lifecycle_state = 'ready',
            updated_at = now()
      where id = $1
        and workspace_id = $2
    returning id, workspace_id, created_by_plexon_user_id, storage_key, original_filename, mime_type,
              bytes, checksum_sha256, lifecycle_state, created_at, updated_at`,
    [mediaAssetId, workspaceId],
  )
  return result.rows[0] ? mapMedia(result.rows[0]) : null
}

export async function markMediaFailed(mediaAssetId: string, workspaceId: string): Promise<MediaAsset | null> {
  const result = await databasePool().query<MediaRow>(
    `update media_assets
        set lifecycle_state = 'failed',
            updated_at = now()
      where id = $1
        and workspace_id = $2
    returning id, workspace_id, created_by_plexon_user_id, storage_key, original_filename, mime_type,
              bytes, checksum_sha256, lifecycle_state, created_at, updated_at`,
    [mediaAssetId, workspaceId],
  )
  return result.rows[0] ? mapMedia(result.rows[0]) : null
}
