export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.VIDEON_PIPELINE_WORKER_ENABLED === 'false') return
  if (!process.env.DATABASE_URL) return

  const { startPipelineWorker } = await import('./lib/pipeline/worker')
  void startPipelineWorker().catch((error) => {
    console.error('[VIDEON-v3] Pipeline worker failed to start', error)
  })
}
