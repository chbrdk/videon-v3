import { randomUUID } from 'node:crypto'
import { databasePool } from './client'

export const BRAND_CHECK_STATUSES = [
  'queued_pending_brandion',
  'running',
  'pass',
  'warn',
  'fail',
  'skipped',
] as const

export type BrandCheckStatus = (typeof BRAND_CHECK_STATUSES)[number]

export type MediaBrandCheck = {
  id: string
  mediaAssetId: string
  analysisRunId: string
  sceneKey: string
  status: BrandCheckStatus
  brandionRequestId: string | null
  brandCandidates: unknown
  evidenceFrameRefs: unknown
  result: unknown
  provenance: unknown
  createdAt: string
  updatedAt: string
}

type BrandCheckRow = {
  id: string
  media_asset_id: string
  analysis_run_id: string
  scene_key: string
  status: BrandCheckStatus
  brandion_request_id: string | null
  brand_candidates: unknown
  evidence_frame_refs: unknown
  result: unknown
  provenance: unknown
  created_at: string
  updated_at: string
}

function mapBrandCheck(row: BrandCheckRow): MediaBrandCheck {
  return {
    id: row.id,
    mediaAssetId: row.media_asset_id,
    analysisRunId: row.analysis_run_id,
    sceneKey: row.scene_key,
    status: row.status,
    brandionRequestId: row.brandion_request_id,
    brandCandidates: row.brand_candidates,
    evidenceFrameRefs: row.evidence_frame_refs,
    result: row.result,
    provenance: row.provenance,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function upsertPendingBrandCheck(input: {
  mediaAssetId: string
  analysisRunId: string
  sceneKey: string
  brandCandidates: unknown
  evidenceFrameRefs: unknown
  provenance?: Record<string, unknown>
}): Promise<MediaBrandCheck> {
  const id = randomUUID()
  const result = await databasePool().query<BrandCheckRow>(
    `insert into media_brand_checks (
       id, media_asset_id, analysis_run_id, scene_key, status,
       brand_candidates, evidence_frame_refs, provenance
     ) values ($1, $2, $3, $4, 'queued_pending_brandion', $5::jsonb, $6::jsonb, $7::jsonb)
     on conflict (analysis_run_id, scene_key)
     do update set
       status = 'queued_pending_brandion',
       brandion_request_id = null,
       brand_candidates = excluded.brand_candidates,
       evidence_frame_refs = excluded.evidence_frame_refs,
       result = null,
       provenance = excluded.provenance,
       updated_at = now()
     returning id, media_asset_id, analysis_run_id, scene_key, status, brandion_request_id,
               brand_candidates, evidence_frame_refs, result, provenance, created_at, updated_at`,
    [
      id,
      input.mediaAssetId,
      input.analysisRunId,
      input.sceneKey,
      JSON.stringify(input.brandCandidates ?? []),
      JSON.stringify(input.evidenceFrameRefs ?? []),
      JSON.stringify({
        seam: 'videon.brand-compliance.v1',
        note: 'Awaiting Brandion API contract',
        ...(input.provenance ?? {}),
      }),
    ],
  )
  return mapBrandCheck(result.rows[0])
}

export async function listBrandChecksForAnalysis(analysisRunId: string): Promise<MediaBrandCheck[]> {
  const result = await databasePool().query<BrandCheckRow>(
    `select id, media_asset_id, analysis_run_id, scene_key, status, brandion_request_id,
            brand_candidates, evidence_frame_refs, result, provenance, created_at, updated_at
       from media_brand_checks
      where analysis_run_id = $1
      order by scene_key asc`,
    [analysisRunId],
  )
  return result.rows.map(mapBrandCheck)
}
