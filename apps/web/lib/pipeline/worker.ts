import { listRecentFailedPipelineStages } from '@/lib/db/analysis'
import {
  registerBrandComplianceHandler,
  registerCutExportHandler,
  registerMediaAnalysisHandler,
  registerMediaGenerateHandler,
  registerMediaReframeHandler,
} from '@/lib/jobs/pg-boss-queue'
import { runCutExport } from '@/lib/pipeline/export-cut'
import { runMediaAnalysis } from '@/lib/pipeline/run-analysis'
import { runBrandComplianceForAnalysis } from '@/lib/pipeline/run-brand-compliance'
import { runMediaGenerate } from '@/lib/pipeline/run-generate'
import { runMediaReframe } from '@/lib/pipeline/run-reframe'

let started = false

async function logRecentPipelineFailures(): Promise<void> {
  try {
    const failures = await listRecentFailedPipelineStages(5)
    if (!failures.length) return
    for (const failure of failures) {
      console.error(
        '[VIDEON-v3] Recent pipeline failure',
        JSON.stringify({
          analysisRunId: failure.analysisRunId,
          mediaFilename: failure.mediaFilename,
          stageKey: failure.stageKey,
          errorMessage: failure.errorMessage,
          updatedAt: failure.updatedAt,
        }),
      )
    }
  } catch (error) {
    console.error('[VIDEON-v3] Could not load recent pipeline failures', error)
  }
}

export async function startPipelineWorker(): Promise<void> {
  if (started) return
  started = true
  await logRecentPipelineFailures()
  await registerMediaAnalysisHandler(async (payload) => {
    await runMediaAnalysis(payload.analysisRunId)
  })
  await registerBrandComplianceHandler(async (payload) => {
    await runBrandComplianceForAnalysis(payload.analysisRunId)
  })
  await registerCutExportHandler(async (payload) => {
    await runCutExport(payload.exportId)
  })
  await registerMediaReframeHandler(async (payload) => {
    await runMediaReframe(payload.reframeId)
  })
  await registerMediaGenerateHandler(async (payload) => {
    await runMediaGenerate(payload.jobId)
  })
  console.info(
    '[VIDEON-v3] Pipeline worker subscribed to durable media analysis, brand compliance, cut export, reframe, and generate jobs',
  )
}
