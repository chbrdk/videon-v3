import { databasePool } from './client'

export type MultipartPartRecord = {
  partNumber: number
  etag: string
}

export type MediaMultipartUpload = {
  mediaAssetId: string
  workspaceId: string
  s3UploadId: string
  parts: MultipartPartRecord[]
  createdAt: string
  updatedAt: string
}

type MultipartRow = {
  media_asset_id: string
  workspace_id: string
  s3_upload_id: string
  parts: MultipartPartRecord[] | string
  created_at: Date | string
  updated_at: Date | string
}

function mapParts(raw: MultipartRow['parts']): MultipartPartRecord[] {
  const parsed = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter(
      (entry): entry is MultipartPartRecord =>
        Boolean(entry) &&
        typeof entry === 'object' &&
        typeof (entry as MultipartPartRecord).partNumber === 'number' &&
        typeof (entry as MultipartPartRecord).etag === 'string',
    )
    .map((entry) => ({ partNumber: entry.partNumber, etag: entry.etag }))
}

function mapRow(row: MultipartRow): MediaMultipartUpload {
  return {
    mediaAssetId: row.media_asset_id,
    workspaceId: row.workspace_id,
    s3UploadId: row.s3_upload_id,
    parts: mapParts(row.parts),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

export async function createMediaMultipartUpload(input: {
  mediaAssetId: string
  workspaceId: string
  s3UploadId: string
}): Promise<MediaMultipartUpload> {
  const result = await databasePool().query<MultipartRow>(
    `insert into media_multipart_uploads (media_asset_id, workspace_id, s3_upload_id, parts)
     values ($1, $2, $3, '[]'::jsonb)
     on conflict (media_asset_id) do update
       set s3_upload_id = excluded.s3_upload_id,
           parts = '[]'::jsonb,
           updated_at = now()
     returning media_asset_id, workspace_id, s3_upload_id, parts, created_at, updated_at`,
    [input.mediaAssetId, input.workspaceId, input.s3UploadId],
  )
  return mapRow(result.rows[0])
}

export async function findMediaMultipartUpload(mediaAssetId: string): Promise<MediaMultipartUpload | null> {
  const result = await databasePool().query<MultipartRow>(
    `select media_asset_id, workspace_id, s3_upload_id, parts, created_at, updated_at
       from media_multipart_uploads
      where media_asset_id = $1`,
    [mediaAssetId],
  )
  return result.rows[0] ? mapRow(result.rows[0]) : null
}

export async function upsertMediaMultipartPart(input: {
  mediaAssetId: string
  partNumber: number
  etag: string
}): Promise<MediaMultipartUpload | null> {
  const current = await findMediaMultipartUpload(input.mediaAssetId)
  if (!current) return null
  const nextParts = current.parts.filter((part) => part.partNumber !== input.partNumber)
  nextParts.push({ partNumber: input.partNumber, etag: input.etag })
  nextParts.sort((a, b) => a.partNumber - b.partNumber)
  const result = await databasePool().query<MultipartRow>(
    `update media_multipart_uploads
        set parts = $2::jsonb,
            updated_at = now()
      where media_asset_id = $1
      returning media_asset_id, workspace_id, s3_upload_id, parts, created_at, updated_at`,
    [input.mediaAssetId, JSON.stringify(nextParts)],
  )
  return result.rows[0] ? mapRow(result.rows[0]) : null
}

export async function deleteMediaMultipartUpload(mediaAssetId: string): Promise<void> {
  await databasePool().query(`delete from media_multipart_uploads where media_asset_id = $1`, [mediaAssetId])
}
