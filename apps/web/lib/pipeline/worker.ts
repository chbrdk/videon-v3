import { registerMediaAnalysisHandler } from '@/lib/jobs/pg-boss-queue'
import { runMediaAnalysis } from '@/lib/pipeline/run-analysis'

let started = false

export async function startPipelineWorker(): Promise<void> {
  if (started) return
  started = true
  await registerMediaAnalysisHandler(async (payload) => {
    await runMediaAnalysis(payload.analysisRunId)
  })
  console.info('[VIDEON-v3] Pipeline worker subscribed to durable media analysis jobs')
}
