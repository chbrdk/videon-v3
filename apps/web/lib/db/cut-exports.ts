import { randomUUID } from 'node:crypto'
import { databasePool } from './client'

export type CutExportStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
export type CutExportFormat = 'mp4'

export type CutExport = {
  id: string
  cutId: string
  workspaceId: string
  requestedByPlexonUserId: string
  format: CutExportFormat
  status: CutExportStatus
  storageKey: string | null
  bytes: number | null
  errorMessage: string | null
  idempotencyKey: string
  createdAt: string
  updatedAt: string
}

type CutExportRow = {
  id: string
  cut_id: string
  workspace_id: string
  requested_by_plexon_user_id: string
  format: CutExportFormat
  status: CutExportStatus
  storage_key: string | null
  bytes: string | number | null
  error_message: string | null
  idempotency_key: string
  created_at: Date | string
  updated_at: Date | string
}

function mapCutExport(row: CutExportRow): CutExport {
  return {
    id: row.id,
    cutId: row.cut_id,
    workspaceId: row.workspace_id,
    requestedByPlexonUserId: row.requested_by_plexon_user_id,
    format: row.format,
    status: row.status,
    storageKey: row.storage_key,
    bytes: row.bytes === null ? null : Number(row.bytes),
    errorMessage: row.error_message,
    idempotencyKey: row.idempotency_key,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

export async function createCutExport(input: {
  cutId: string
  workspaceId: string
  requestedByPlexonUserId: string
  format?: CutExportFormat
  idempotencyKey: string
}): Promise<CutExport> {
  const id = randomUUID()
  const result = await databasePool().query<CutExportRow>(
    `insert into cut_exports (
       id, cut_id, workspace_id, requested_by_plexon_user_id, format, status, idempotency_key
     ) values ($1, $2, $3, $4, $5, 'queued', $6)
     on conflict (idempotency_key)
     do update set updated_at = cut_exports.updated_at
     returning id, cut_id, workspace_id, requested_by_plexon_user_id, format, status, storage_key, bytes,
               error_message, idempotency_key, created_at, updated_at`,
    [
      id,
      input.cutId,
      input.workspaceId,
      input.requestedByPlexonUserId,
      input.format ?? 'mp4',
      input.idempotencyKey,
    ],
  )
  return mapCutExport(result.rows[0])
}

export async function findCutExport(exportId: string): Promise<CutExport | null> {
  const result = await databasePool().query<CutExportRow>(
    `select id, cut_id, workspace_id, requested_by_plexon_user_id, format, status, storage_key, bytes,
            error_message, idempotency_key, created_at, updated_at
       from cut_exports
      where id = $1`,
    [exportId],
  )
  return result.rows[0] ? mapCutExport(result.rows[0]) : null
}

export async function listCutExportsForCut(cutId: string): Promise<CutExport[]> {
  const result = await databasePool().query<CutExportRow>(
    `select id, cut_id, workspace_id, requested_by_plexon_user_id, format, status, storage_key, bytes,
            error_message, idempotency_key, created_at, updated_at
       from cut_exports
      where cut_id = $1
      order by created_at desc
      limit 20`,
    [cutId],
  )
  return result.rows.map(mapCutExport)
}

export async function markCutExportRunning(exportId: string): Promise<void> {
  await databasePool().query(
    `update cut_exports
        set status = 'running',
            updated_at = now()
      where id = $1
        and status in ('queued', 'running')`,
    [exportId],
  )
}

export async function markCutExportSucceeded(input: {
  exportId: string
  storageKey: string
  bytes: number
}): Promise<void> {
  await databasePool().query(
    `update cut_exports
        set status = 'succeeded',
            storage_key = $2,
            bytes = $3,
            error_message = null,
            updated_at = now()
      where id = $1`,
    [input.exportId, input.storageKey, input.bytes],
  )
}

export async function markCutExportFailed(exportId: string, errorMessage: string): Promise<void> {
  await databasePool().query(
    `update cut_exports
        set status = 'failed',
            error_message = $2,
            updated_at = now()
      where id = $1`,
    [exportId, errorMessage.slice(0, 2000)],
  )
}
