import { registerCutExportHandler, registerMediaAnalysisHandler } from '@/lib/jobs/pg-boss-queue'
import { runCutExport } from '@/lib/pipeline/export-cut'
import { runMediaAnalysis } from '@/lib/pipeline/run-analysis'

let started = false

export async function startPipelineWorker(): Promise<void> {
  if (started) return
  started = true
  await registerMediaAnalysisHandler(async (payload) => {
    await runMediaAnalysis(payload.analysisRunId)
  })
  await registerCutExportHandler(async (payload) => {
    await runCutExport(payload.exportId)
  })
  console.info('[VIDEON-v3] Pipeline worker subscribed to durable media analysis and cut export jobs')
}
