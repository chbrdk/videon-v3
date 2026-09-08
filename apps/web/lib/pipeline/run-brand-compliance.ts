import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  findAnalysisRun,
  listSceneInsightsForAnalysis,
  upsertStageRun,
} from '@/lib/db/analysis'
import { upsertBrandCheck } from '@/lib/db/brand-checks'
import { findMediaAsset } from '@/lib/db/media'
import { findWorkspaceById } from '@/lib/db/workspaces'
import { selectBrandEvidenceRefs } from '@/lib/brand-findings'
import {
  checkSceneFramesAgainstBrandion,
  fetchBrandionActivePack,
  type BrandionEvidenceFrame,
} from '@/lib/brandion-client'
import { extractFrameJpegBase64 } from '@/lib/pipeline/frame-sample'
import { isBrandionCheckConfigured } from '@/lib/runtime-config'
import { S3ObjectStore } from '@/lib/storage/s3-object-store'

export type BrandComplianceProgress = {
  completed: number
  total: number
}

async function extractEvidenceJpegs(
  sourcePath: string,
  refs: Array<{ id: string; timestampMs: number }>,
): Promise<BrandionEvidenceFrame[]> {
  const frames: BrandionEvidenceFrame[] = []
  for (const ref of refs) {
    const jpeg = await extractFrameJpegBase64(sourcePath, ref.timestampMs)
    if (!jpeg) continue
    frames.push({
      frameId: ref.id,
      timestampMs: ref.timestampMs,
      base64Jpeg: jpeg.base64,
    })
  }
  return frames
}

/** Run Brandion checks for existing scene insights; reuses evidence timestamps from frame_refs. */
export async function executeBrandCompliance(input: {
  analysisRunId: string
  mediaAssetId: string
  sourcePath: string
  requestedByPlexonUserId: string
  inputFingerprint: string
  onProgress?: (progress: BrandComplianceProgress) => Promise<void>
}): Promise<{ sceneCount: number; guidelineId: string | null; reason?: string }> {
  const insights = await listSceneInsightsForAnalysis(input.analysisRunId)
  const media = await findMediaAsset(input.mediaAssetId)
  if (!media) throw new Error('Media asset not found')

  const workspace = await findWorkspaceById(media.workspaceId)
  const platformProjectId = workspace?.platformProjectId ?? ''
  const pack =
    isBrandionCheckConfigured() && platformProjectId
      ? await fetchBrandionActivePack(platformProjectId, {
          userId: input.requestedByPlexonUserId,
        })
      : null
  const guidelineId = pack?.guidelineId ?? null

  let completed = 0
  for (const entry of insights) {
    const evidenceRefs = selectBrandEvidenceRefs({
      frameRefs: entry.frameRefs,
      brandCandidates: entry.insight.brandCandidates,
      startMs: entry.startMs,
      endMs: entry.endMs,
    })

    if (!isBrandionCheckConfigured()) {
      await upsertBrandCheck({
        mediaAssetId: media.id,
        analysisRunId: input.analysisRunId,
        sceneKey: entry.sceneKey,
        status: 'queued_pending_brandion',
        brandCandidates: entry.insight.brandCandidates,
        evidenceFrameRefs: evidenceRefs,
        provenance: {
          reason: 'brandion_unconfigured',
          schemaVersion: entry.insight.schemaVersion,
          evidenceFrameCount: evidenceRefs.length,
          evidenceTimestampsMs: evidenceRefs.map((frame) => frame.timestampMs),
          hint: 'BRANDION_API_URL setzen und Brandion erreichbar machen.',
        },
      })
    } else if (!guidelineId) {
      await upsertBrandCheck({
        mediaAssetId: media.id,
        analysisRunId: input.analysisRunId,
        sceneKey: entry.sceneKey,
        status: 'skipped',
        brandCandidates: entry.insight.brandCandidates,
        evidenceFrameRefs: evidenceRefs,
        provenance: {
          reason: 'no_active_guideline',
          platformProjectId,
          schemaVersion: entry.insight.schemaVersion,
          evidenceFrameCount: evidenceRefs.length,
          evidenceTimestampsMs: evidenceRefs.map((frame) => frame.timestampMs),
          hint: 'In Brandion ein Active-Pack für dieses Projekt setzen.',
        },
      })
    } else {
      const frames = await extractEvidenceJpegs(input.sourcePath, evidenceRefs)
      if (!frames.length) {
        await upsertBrandCheck({
          mediaAssetId: media.id,
          analysisRunId: input.analysisRunId,
          sceneKey: entry.sceneKey,
          status: 'queued_pending_brandion',
          brandCandidates: entry.insight.brandCandidates,
          evidenceFrameRefs: evidenceRefs,
          provenance: {
            reason: 'evidence_frame_extract_failed',
            guidelineId,
            evidenceFrameCount: evidenceRefs.length,
            evidenceTimestampsMs: evidenceRefs.map((frame) => frame.timestampMs),
          },
        })
      } else {
        const check = await checkSceneFramesAgainstBrandion({
          guidelineId,
          platformProjectId,
          sceneKey: entry.sceneKey,
          frames,
          brandCandidates: entry.insight.brandCandidates.map((candidate) => ({
            text: candidate.text,
            kind: candidate.kind,
            confidence: candidate.confidence,
          })),
          tokens: pack?.tokens ?? [],
          userId: input.requestedByPlexonUserId,
        })
        await upsertBrandCheck({
          mediaAssetId: media.id,
          analysisRunId: input.analysisRunId,
          sceneKey: entry.sceneKey,
          status: check.status,
          brandCandidates: entry.insight.brandCandidates,
          evidenceFrameRefs: evidenceRefs,
          brandionRequestId: check.brandionRequestId,
          result: check.result,
          provenance: {
            ...check.provenance,
            schemaVersion: entry.insight.schemaVersion,
            requestedEvidenceFrameCount: evidenceRefs.length,
            extractedEvidenceFrameCount: frames.length,
          },
        })
      }
    }

    completed += 1
    await input.onProgress?.({ completed, total: insights.length || 1 })
  }

  return {
    sceneCount: insights.length,
    guidelineId,
    reason: !isBrandionCheckConfigured()
      ? 'brandion_unconfigured'
      : !guidelineId
        ? 'no_active_guideline'
        : undefined,
  }
}

/** Standalone Brand-Check for an existing analysis run (downloads source once). */
export async function runBrandComplianceForAnalysis(analysisRunId: string): Promise<void> {
  const analysis = await findAnalysisRun(analysisRunId)
  if (!analysis) throw new Error('Analysis run not found')

  const media = await findMediaAsset(analysis.mediaAssetId)
  if (!media) throw new Error('Media asset not found')

  const fingerprint = analysis.inputFingerprint
  const tempPath = join(tmpdir(), `videon-brand-${randomUUID()}`)
  const store = new S3ObjectStore()

  await upsertStageRun({
    analysisRunId,
    stageKey: 'brand_compliance',
    inputFingerprint: fingerprint,
    status: 'running',
    progressCompleted: 0,
    progressTotal: 1,
  })

  try {
    await store.downloadObjectToFile({
      workspaceId: media.workspaceId,
      storageKey: media.storageKey,
      destinationPath: tempPath,
    })

    const result = await executeBrandCompliance({
      analysisRunId,
      mediaAssetId: media.id,
      sourcePath: tempPath,
      requestedByPlexonUserId: analysis.requestedByPlexonUserId,
      inputFingerprint: fingerprint,
      onProgress: async ({ completed, total }) => {
        await upsertStageRun({
          analysisRunId,
          stageKey: 'brand_compliance',
          inputFingerprint: fingerprint,
          status: 'running',
          progressCompleted: completed,
          progressTotal: total,
        })
      },
    })

    await upsertStageRun({
      analysisRunId,
      stageKey: 'brand_compliance',
      inputFingerprint: fingerprint,
      status: 'succeeded',
      progressCompleted: result.sceneCount || 1,
      progressTotal: result.sceneCount || 1,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Brand compliance failed'
    await upsertStageRun({
      analysisRunId,
      stageKey: 'brand_compliance',
      inputFingerprint: fingerprint,
      status: 'failed',
      progressCompleted: 0,
      progressTotal: 1,
      errorCode: 'stage_failed',
      errorMessage: message,
    })
    throw error
  } finally {
    await unlink(tempPath).catch(() => {})
  }
}
