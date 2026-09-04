export const DURABLE_JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const
export type DurableJobStatus = (typeof DURABLE_JOB_STATUSES)[number]

export type DurableJob = {
  id: string
  type: 'media.analysis' | 'cut.export' | 'media.reframe'
  idempotencyKey: string
  status: DurableJobStatus
  payload: Record<string, unknown>
  progress: { completed: number; total: number }
  createdAt: string
  updatedAt: string
}

/** Adapter contract for a persisted queue; timers and process-local arrays are explicitly invalid implementations. */
export interface DurableJobQueue {
  enqueue(input: Omit<DurableJob, 'id' | 'status' | 'progress' | 'createdAt' | 'updatedAt'>): Promise<DurableJob>
  get(jobId: string): Promise<DurableJob | null>
  requestCancellation(jobId: string): Promise<DurableJob | null>
}
