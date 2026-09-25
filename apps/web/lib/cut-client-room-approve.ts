/**
 * Export freigabe for ClientRoom slot `videon_cut`.
 * Spec: specs/domain/suite-enterprise-program.md § E2 / E5
 */

import { aggregateBrandCheckStatuses, toBrandCheckView } from '@/lib/brand-findings'
import { findLatestAnalysisForMedia } from '@/lib/db/analysis'
import { listBrandChecksForAnalysis, type BrandCheckStatus } from '@/lib/db/brand-checks'
import { listCutExportsForCut, type CutExport } from '@/lib/db/cut-exports'
import { listScenesForCut, type Cut } from '@/lib/db/cuts'

export type CutClientRoomBrandGate =
  | {
      ok: true
      guidelineId: string | null
      guidelineVersion: string | null
      analysisRunIds: string[]
      brandStatus: BrandCheckStatus
      exportJob: CutExport
    }
  | {
      ok: false
      code:
        | 'cut_empty'
        | 'export_missing'
        | 'brand_check_missing'
        | 'brand_check_failed'
        | 'analysis_missing'
    }

function provenanceString(provenance: unknown, key: string): string | null {
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) return null
  const value = (provenance as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/**
 * Brand-Check gate before ClientRoom publish.
 * Requires a succeeded export and a passing Brandion measurement on every media in the cut.
 */
export async function evaluateCutClientRoomBrandGate(cut: Cut): Promise<CutClientRoomBrandGate> {
  const scenes = await listScenesForCut(cut.id)
  const mediaIds = [...new Set(scenes.map((s) => s.mediaAssetId).filter(Boolean))]
  if (mediaIds.length === 0) return { ok: false, code: 'cut_empty' }

  const exports = await listCutExportsForCut(cut.id)
  const exportJob = exports.find((e) => e.status === 'succeeded')
  if (!exportJob) return { ok: false, code: 'export_missing' }

  const statuses: BrandCheckStatus[] = []
  const analysisRunIds: string[] = []
  let guidelineId: string | null = null
  let guidelineVersion: string | null = null

  for (const mediaAssetId of mediaIds) {
    const analysis = await findLatestAnalysisForMedia(mediaAssetId)
    if (!analysis || analysis.status !== 'succeeded') {
      return { ok: false, code: 'analysis_missing' }
    }
    analysisRunIds.push(analysis.id)
    const checks = await listBrandChecksForAnalysis(analysis.id)
    if (checks.length === 0) return { ok: false, code: 'brand_check_missing' }

    for (const check of checks) {
      statuses.push(check.status)
      const view = toBrandCheckView({
        sceneKey: check.sceneKey,
        status: check.status,
        brandionRequestId: check.brandionRequestId,
        result: check.result,
        provenance: check.provenance,
      })
      if (!guidelineId && view.guidelineId) guidelineId = view.guidelineId
      if (!guidelineVersion) {
        guidelineVersion =
          provenanceString(check.provenance, 'guidelineVersion') ??
          provenanceString(check.provenance, 'packVersion')
      }
    }
  }

  const brandStatus = aggregateBrandCheckStatuses(statuses)
  if (brandStatus !== 'pass') {
    return { ok: false, code: 'brand_check_failed' }
  }

  return {
    ok: true,
    guidelineId,
    guidelineVersion,
    analysisRunIds,
    brandStatus,
    exportJob,
  }
}
