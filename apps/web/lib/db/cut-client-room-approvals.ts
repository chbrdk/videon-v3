/**
 * Persist Cut ClientRoom export freigabe (guideline + Messlauf).
 * Spec: specs/domain/suite-enterprise-program.md § E2
 */

import { randomUUID } from 'node:crypto'
import { databasePool } from './client'

export type CutClientRoomApproval = {
  id: string
  cutId: string
  workspaceId: string
  exportId: string | null
  approvedByPlexonUserId: string
  guidelineId: string | null
  guidelineVersion: string | null
  analysisRunIds: string[]
  brandStatus: string
  createdAt: string
}

type Row = {
  id: string
  cut_id: string
  workspace_id: string
  export_id: string | null
  approved_by_plexon_user_id: string
  guideline_id: string | null
  guideline_version: string | null
  analysis_run_ids: unknown
  brand_status: string
  created_at: Date | string
}

function mapRow(row: Row): CutClientRoomApproval {
  const ids = Array.isArray(row.analysis_run_ids)
    ? row.analysis_run_ids.filter((v): v is string => typeof v === 'string')
    : typeof row.analysis_run_ids === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(row.analysis_run_ids) as unknown
            return Array.isArray(parsed)
              ? parsed.filter((v): v is string => typeof v === 'string')
              : []
          } catch {
            return []
          }
        })()
      : []
  return {
    id: row.id,
    cutId: row.cut_id,
    workspaceId: row.workspace_id,
    exportId: row.export_id,
    approvedByPlexonUserId: row.approved_by_plexon_user_id,
    guidelineId: row.guideline_id,
    guidelineVersion: row.guideline_version,
    analysisRunIds: ids,
    brandStatus: row.brand_status,
    createdAt: new Date(row.created_at).toISOString(),
  }
}

export async function insertCutClientRoomApproval(input: {
  cutId: string
  workspaceId: string
  exportId?: string | null
  approvedByPlexonUserId: string
  guidelineId?: string | null
  guidelineVersion?: string | null
  analysisRunIds: string[]
  brandStatus: string
}): Promise<CutClientRoomApproval> {
  const id = randomUUID()
  const result = await databasePool().query<Row>(
    `insert into cut_client_room_approvals (
       id, cut_id, workspace_id, export_id, approved_by_plexon_user_id,
       guideline_id, guideline_version, analysis_run_ids, brand_status
     ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
     returning id, cut_id, workspace_id, export_id, approved_by_plexon_user_id,
               guideline_id, guideline_version, analysis_run_ids, brand_status, created_at`,
    [
      id,
      input.cutId,
      input.workspaceId,
      input.exportId ?? null,
      input.approvedByPlexonUserId,
      input.guidelineId ?? null,
      input.guidelineVersion ?? null,
      JSON.stringify(input.analysisRunIds),
      input.brandStatus,
    ],
  )
  return mapRow(result.rows[0])
}

export async function findLatestCutClientRoomApproval(
  cutId: string,
): Promise<CutClientRoomApproval | null> {
  const result = await databasePool().query<Row>(
    `select id, cut_id, workspace_id, export_id, approved_by_plexon_user_id,
            guideline_id, guideline_version, analysis_run_ids, brand_status, created_at
       from cut_client_room_approvals
      where cut_id = $1
      order by created_at desc
      limit 1`,
    [cutId],
  )
  return result.rows[0] ? mapRow(result.rows[0]) : null
}
