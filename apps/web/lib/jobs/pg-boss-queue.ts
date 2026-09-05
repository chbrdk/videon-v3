import { PgBoss } from 'pg-boss'
import { databaseUrl } from '@/lib/runtime-config'
import { ANALYSIS_JOB_NAME } from '@/lib/pipeline/constants'

export type MediaAnalysisJobPayload = {
  analysisRunId: string
  mediaAssetId: string
}

let boss: PgBoss | null = null
let bossStart: Promise<PgBoss> | null = null

async function ensureAnalysisQueue(queue: PgBoss): Promise<void> {
  try {
    await queue.createQueue(ANALYSIS_JOB_NAME)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('already exists')) {
      throw error
    }
  }
}

export function pipelineQueueConfigured(): boolean {
  return Boolean(databaseUrl())
}

async function getBoss(): Promise<PgBoss> {
  const connectionString = databaseUrl()
  if (!connectionString) throw new Error('DATABASE_URL is required for the durable queue')
  if (boss) return boss
  if (!bossStart) {
    boss = new PgBoss({ connectionString })
    bossStart = boss.start().then(async () => {
      await ensureAnalysisQueue(boss as PgBoss)
      return boss as PgBoss
    })
  }
  return bossStart
}

export async function enqueueMediaAnalysisJob(payload: MediaAnalysisJobPayload): Promise<string | null> {
  const queue = await getBoss()
  return queue.send(ANALYSIS_JOB_NAME, payload, {
    singletonKey: payload.analysisRunId,
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 120 * 60,
  })
}

export async function registerMediaAnalysisHandler(
  handler: (payload: MediaAnalysisJobPayload) => Promise<void>,
): Promise<void> {
  const queue = await getBoss()
  await queue.work(ANALYSIS_JOB_NAME, { localConcurrency: 1 }, async (jobs) => {
    for (const job of jobs) {
      const payload = job.data as MediaAnalysisJobPayload
      if (!payload?.analysisRunId || !payload?.mediaAssetId) {
        throw new Error('Invalid media analysis job payload')
      }
      await handler(payload)
    }
  })
}
