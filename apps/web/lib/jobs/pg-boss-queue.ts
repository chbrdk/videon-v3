import { PgBoss } from 'pg-boss'
import { databaseUrl } from '@/lib/runtime-config'
import {
  ANALYSIS_JOB_NAME,
  BRAND_COMPLIANCE_JOB_NAME,
  EXPORT_JOB_NAME,
  REFRAME_JOB_NAME,
} from '@/lib/pipeline/constants'

export type MediaAnalysisJobPayload = {
  analysisRunId: string
  mediaAssetId: string
}

export type BrandComplianceJobPayload = {
  analysisRunId: string
  mediaAssetId: string
}

export type CutExportJobPayload = {
  exportId: string
  cutId: string
}

export type MediaReframeJobPayload = {
  reframeId: string
  mediaAssetId: string
}

let boss: PgBoss | null = null
let bossStart: Promise<PgBoss> | null = null

async function ensureQueue(queue: PgBoss, name: string): Promise<void> {
  try {
    await queue.createQueue(name)
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
      await ensureQueue(boss as PgBoss, ANALYSIS_JOB_NAME)
      await ensureQueue(boss as PgBoss, BRAND_COMPLIANCE_JOB_NAME)
      await ensureQueue(boss as PgBoss, EXPORT_JOB_NAME)
      await ensureQueue(boss as PgBoss, REFRAME_JOB_NAME)
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

export async function enqueueBrandComplianceJob(
  payload: BrandComplianceJobPayload,
): Promise<string | null> {
  const queue = await getBoss()
  return queue.send(BRAND_COMPLIANCE_JOB_NAME, payload, {
    singletonKey: `brand:${payload.analysisRunId}`,
    retryLimit: 2,
    retryDelay: 20,
    retryBackoff: true,
    expireInSeconds: 60 * 60,
  })
}

export async function enqueueCutExportJob(payload: CutExportJobPayload): Promise<string | null> {
  const queue = await getBoss()
  return queue.send(EXPORT_JOB_NAME, payload, {
    singletonKey: payload.exportId,
    retryLimit: 2,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 120 * 60,
  })
}

export async function enqueueMediaReframeJob(payload: MediaReframeJobPayload): Promise<string | null> {
  const queue = await getBoss()
  return queue.send(REFRAME_JOB_NAME, payload, {
    singletonKey: payload.reframeId,
    retryLimit: 2,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 180 * 60,
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
      try {
        await handler(payload)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(
          '[VIDEON-v3] Media analysis job failed',
          JSON.stringify({
            analysisRunId: payload.analysisRunId,
            mediaAssetId: payload.mediaAssetId,
            message,
          }),
        )
        throw error
      }
    }
  })
}

export async function registerBrandComplianceHandler(
  handler: (payload: BrandComplianceJobPayload) => Promise<void>,
): Promise<void> {
  const queue = await getBoss()
  await queue.work(BRAND_COMPLIANCE_JOB_NAME, { localConcurrency: 1 }, async (jobs) => {
    for (const job of jobs) {
      const payload = job.data as BrandComplianceJobPayload
      if (!payload?.analysisRunId || !payload?.mediaAssetId) {
        throw new Error('Invalid brand compliance job payload')
      }
      try {
        await handler(payload)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(
          '[VIDEON-v3] Brand compliance job failed',
          JSON.stringify({
            analysisRunId: payload.analysisRunId,
            mediaAssetId: payload.mediaAssetId,
            message,
          }),
        )
        throw error
      }
    }
  })
}

export async function registerCutExportHandler(
  handler: (payload: CutExportJobPayload) => Promise<void>,
): Promise<void> {
  const queue = await getBoss()
  await queue.work(EXPORT_JOB_NAME, { localConcurrency: 1 }, async (jobs) => {
    for (const job of jobs) {
      const payload = job.data as CutExportJobPayload
      if (!payload?.exportId || !payload?.cutId) {
        throw new Error('Invalid cut export job payload')
      }
      await handler(payload)
    }
  })
}

export async function registerMediaReframeHandler(
  handler: (payload: MediaReframeJobPayload) => Promise<void>,
): Promise<void> {
  const queue = await getBoss()
  await queue.work(REFRAME_JOB_NAME, { localConcurrency: 1 }, async (jobs) => {
    for (const job of jobs) {
      const payload = job.data as MediaReframeJobPayload
      if (!payload?.reframeId || !payload?.mediaAssetId) {
        throw new Error('Invalid media reframe job payload')
      }
      try {
        await handler(payload)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(
          '[VIDEON-v3] Media reframe job failed',
          JSON.stringify({
            reframeId: payload.reframeId,
            mediaAssetId: payload.mediaAssetId,
            message,
          }),
        )
        throw error
      }
    }
  })
}
