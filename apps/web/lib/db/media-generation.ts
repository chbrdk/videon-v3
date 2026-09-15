import { createHash, randomUUID } from 'node:crypto'
import { databasePool } from './client'

export type MediaGenerationIntent = 'edit' | 'create'
export type MediaGenerationLane = 'draft' | 'final'
export type MediaGenerationStatus =
  | 'queued'
  | 'running'
  | 'draft_ready'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export type MediaGenerationJob = {
  id: string
  mediaAssetId: string | null
  workspaceId: string
  requestedByPlexonUserId: string
  intent: MediaGenerationIntent
  lane: MediaGenerationLane
  modelId: string
  prompt: string
  startMs: number | null
  endMs: number | null
  durationSeconds: number | null
  aspectRatio: string | null
  skipDraft: boolean
  keepSourceAudio: boolean
  referenceImageUrls: string[]
  seed: number | null
  lockPack: Record<string, unknown>
  lockPackHash: string | null
  status: MediaGenerationStatus
  progressPercent: number | null
  sliceStorageKey: string | null
  draftStorageKey: string | null
  draftBytes: number | null
  finalStorageKey: string | null
  finalBytes: number | null
  promotedMediaAssetId: string | null
  targetCutId: string | null
  targetCutInsertedAt: string | null
  providerRequestId: string | null
  errorMessage: string | null
  idempotencyKey: string
  createdAt: string
  updatedAt: string
}

type MediaGenerationJobRow = {
  id: string
  media_asset_id: string | null
  workspace_id: string
  requested_by_plexon_user_id: string
  intent: MediaGenerationIntent
  lane: MediaGenerationLane
  model_id: string
  prompt: string
  start_ms: number | null
  end_ms: number | null
  duration_seconds: number | null
  aspect_ratio: string | null
  skip_draft: boolean
  keep_source_audio: boolean
  reference_image_urls: unknown
  seed: number | null
  lock_pack: unknown
  lock_pack_hash: string | null
  status: MediaGenerationStatus
  progress_percent: number | null
  slice_storage_key: string | null
  draft_storage_key: string | null
  draft_bytes: string | number | null
  final_storage_key: string | null
  final_bytes: string | number | null
  promoted_media_asset_id: string | null
  target_cut_id: string | null
  target_cut_inserted_at: Date | string | null
  provider_request_id: string | null
  error_message: string | null
  idempotency_key: string
  created_at: Date | string
  updated_at: Date | string
}

const SELECT_COLUMNS = `id, media_asset_id, workspace_id, requested_by_plexon_user_id, intent, lane,
            model_id, prompt, start_ms, end_ms, duration_seconds, aspect_ratio, skip_draft, keep_source_audio,
            reference_image_urls, seed, lock_pack, lock_pack_hash, status, progress_percent, slice_storage_key,
            draft_storage_key, draft_bytes, final_storage_key, final_bytes, promoted_media_asset_id,
            target_cut_id, target_cut_inserted_at,
            provider_request_id, error_message, idempotency_key, created_at, updated_at`

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function mapJob(row: MediaGenerationJobRow): MediaGenerationJob {
  return {
    id: row.id,
    mediaAssetId: row.media_asset_id,
    workspaceId: row.workspace_id,
    requestedByPlexonUserId: row.requested_by_plexon_user_id,
    intent: row.intent,
    lane: row.lane,
    modelId: row.model_id,
    prompt: row.prompt,
    startMs: row.start_ms,
    endMs: row.end_ms,
    durationSeconds: row.duration_seconds,
    aspectRatio: row.aspect_ratio,
    skipDraft: Boolean(row.skip_draft),
    keepSourceAudio: Boolean(row.keep_source_audio),
    referenceImageUrls: asStringArray(row.reference_image_urls),
    seed: row.seed,
    lockPack: asRecord(row.lock_pack),
    lockPackHash: row.lock_pack_hash,
    status: row.status,
    progressPercent: row.progress_percent,
    sliceStorageKey: row.slice_storage_key,
    draftStorageKey: row.draft_storage_key,
    draftBytes: row.draft_bytes === null ? null : Number(row.draft_bytes),
    finalStorageKey: row.final_storage_key,
    finalBytes: row.final_bytes === null ? null : Number(row.final_bytes),
    promotedMediaAssetId: row.promoted_media_asset_id,
    targetCutId: row.target_cut_id,
    targetCutInsertedAt: row.target_cut_inserted_at
      ? new Date(row.target_cut_inserted_at).toISOString()
      : null,
    providerRequestId: row.provider_request_id,
    errorMessage: row.error_message,
    idempotencyKey: row.idempotency_key,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

export function buildGenerationIdempotencyKey(input: {
  mediaAssetId: string
  intent: MediaGenerationIntent
  startMs: number | null
  endMs: number | null
  prompt: string
  modelId: string
  skipDraft: boolean
  keepSourceAudio: boolean
  referenceImageUrls: string[]
  seed: number | null
}): string {
  const payload = [
    input.mediaAssetId,
    input.intent,
    input.startMs ?? '',
    input.endMs ?? '',
    input.prompt.trim(),
    input.modelId,
    input.skipDraft ? '1' : '0',
    input.keepSourceAudio ? '1' : '0',
    input.referenceImageUrls.join(','),
    input.seed ?? '',
  ].join('|')
  return `generate:${createHash('sha256').update(payload).digest('hex').slice(0, 32)}`
}

export function buildLockPackHash(lockPack: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(lockPack)).digest('hex').slice(0, 32)
}

export async function createMediaGenerationJob(input: {
  mediaAssetId: string | null
  workspaceId: string
  requestedByPlexonUserId: string
  intent: MediaGenerationIntent
  lane: MediaGenerationLane
  modelId: string
  prompt: string
  startMs: number | null
  endMs: number | null
  durationSeconds?: number | null
  aspectRatio?: string | null
  skipDraft: boolean
  keepSourceAudio: boolean
  referenceImageUrls: string[]
  seed: number | null
  lockPack: Record<string, unknown>
  lockPackHash: string
  idempotencyKey: string
  targetCutId?: string | null
}): Promise<MediaGenerationJob> {
  const id = randomUUID()
  const result = await databasePool().query<MediaGenerationJobRow>(
    `insert into media_generation_jobs (
       id, media_asset_id, workspace_id, requested_by_plexon_user_id, intent, lane,
       model_id, prompt, start_ms, end_ms, duration_seconds, aspect_ratio, skip_draft, keep_source_audio,
       reference_image_urls, seed, lock_pack, lock_pack_hash, status, idempotency_key, target_cut_id
     ) values (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10, $11, $12, $13, $14,
       $15::jsonb, $16, $17::jsonb, $18, 'queued', $19, $20
     )
     on conflict (idempotency_key)
     do update set
       target_cut_id = coalesce(excluded.target_cut_id, media_generation_jobs.target_cut_id),
       updated_at = media_generation_jobs.updated_at
     returning ${SELECT_COLUMNS}`,
    [
      id,
      input.mediaAssetId,
      input.workspaceId,
      input.requestedByPlexonUserId,
      input.intent,
      input.lane,
      input.modelId,
      input.prompt,
      input.startMs,
      input.endMs,
      input.durationSeconds ?? null,
      input.aspectRatio ?? null,
      input.skipDraft,
      input.keepSourceAudio,
      JSON.stringify(input.referenceImageUrls),
      input.seed,
      JSON.stringify(input.lockPack),
      input.lockPackHash,
      input.idempotencyKey,
      input.targetCutId ?? null,
    ],
  )
  return mapJob(result.rows[0])
}

export async function findMediaGenerationJob(jobId: string): Promise<MediaGenerationJob | null> {
  const result = await databasePool().query<MediaGenerationJobRow>(
    `select ${SELECT_COLUMNS}
       from media_generation_jobs
      where id = $1`,
    [jobId],
  )
  return result.rows[0] ? mapJob(result.rows[0]) : null
}

export async function listMediaGenerationJobsForMedia(mediaAssetId: string): Promise<MediaGenerationJob[]> {
  const result = await databasePool().query<MediaGenerationJobRow>(
    `select ${SELECT_COLUMNS}
       from media_generation_jobs
      where media_asset_id = $1
      order by created_at desc
      limit 50`,
    [mediaAssetId],
  )
  return result.rows.map(mapJob)
}

export async function listMediaGenerationJobsForWorkspace(workspaceId: string): Promise<MediaGenerationJob[]> {
  const result = await databasePool().query<MediaGenerationJobRow>(
    `select ${SELECT_COLUMNS}
       from media_generation_jobs
      where workspace_id = $1
      order by created_at desc
      limit 50`,
    [workspaceId],
  )
  return result.rows.map(mapJob)
}

export async function listMediaGenerationJobsForTargetCut(cutId: string): Promise<MediaGenerationJob[]> {
  const result = await databasePool().query<MediaGenerationJobRow>(
    `select ${SELECT_COLUMNS}
       from media_generation_jobs
      where target_cut_id = $1
      order by created_at desc
      limit 50`,
    [cutId],
  )
  return result.rows.map(mapJob)
}

export async function setMediaGenerationTargetCut(
  jobId: string,
  targetCutId: string | null,
): Promise<MediaGenerationJob | null> {
  const result = await databasePool().query<MediaGenerationJobRow>(
    `update media_generation_jobs
        set target_cut_id = $2,
            updated_at = now()
      where id = $1
    returning ${SELECT_COLUMNS}`,
    [jobId, targetCutId],
  )
  return result.rows[0] ? mapJob(result.rows[0]) : null
}

export async function markMediaGenerationCutInserted(jobId: string): Promise<void> {
  await databasePool().query(
    `update media_generation_jobs
        set target_cut_inserted_at = coalesce(target_cut_inserted_at, now()),
            updated_at = now()
      where id = $1`,
    [jobId],
  )
}

export async function countActiveGenerationJobsForWorkspace(workspaceId: string): Promise<number> {
  const result = await databasePool().query<{ count: string }>(
    `select count(*)::text as count
       from media_generation_jobs
      where workspace_id = $1
        and status in ('queued', 'running')`,
    [workspaceId],
  )
  return Number(result.rows[0]?.count ?? 0)
}

export async function markMediaGenerationRunning(jobId: string): Promise<void> {
  await databasePool().query(
    `update media_generation_jobs
        set status = 'running',
            progress_percent = coalesce(progress_percent, 0),
            error_message = null,
            updated_at = now()
      where id = $1
        and status in ('queued', 'running', 'draft_ready')`,
    [jobId],
  )
}

export async function markMediaGenerationProgress(jobId: string, progressPercent: number): Promise<void> {
  await databasePool().query(
    `update media_generation_jobs
        set progress_percent = $2,
            updated_at = now()
      where id = $1
        and status = 'running'`,
    [jobId, Math.max(0, Math.min(100, Math.floor(progressPercent)))],
  )
}

export async function markMediaGenerationDraftReady(input: {
  jobId: string
  sliceStorageKey: string
  draftStorageKey: string
  draftBytes: number
  providerRequestId: string | null
}): Promise<void> {
  await databasePool().query(
    `update media_generation_jobs
        set status = 'draft_ready',
            slice_storage_key = $2,
            draft_storage_key = $3,
            draft_bytes = $4,
            provider_request_id = coalesce($5, provider_request_id),
            progress_percent = 100,
            updated_at = now()
      where id = $1`,
    [
      input.jobId,
      input.sliceStorageKey,
      input.draftStorageKey,
      input.draftBytes,
      input.providerRequestId,
    ],
  )
}

export async function markMediaGenerationSucceeded(input: {
  jobId: string
  sliceStorageKey: string | null
  finalStorageKey: string
  finalBytes: number
  promotedMediaAssetId: string
  providerRequestId: string | null
  draftStorageKey?: string | null
  draftBytes?: number | null
}): Promise<void> {
  await databasePool().query(
    `update media_generation_jobs
        set status = 'succeeded',
            slice_storage_key = coalesce($2, slice_storage_key),
            draft_storage_key = coalesce($3, draft_storage_key),
            draft_bytes = coalesce($4, draft_bytes),
            final_storage_key = $5,
            final_bytes = $6,
            promoted_media_asset_id = $7,
            provider_request_id = coalesce($8, provider_request_id),
            progress_percent = 100,
            error_message = null,
            updated_at = now()
      where id = $1`,
    [
      input.jobId,
      input.sliceStorageKey,
      input.draftStorageKey ?? null,
      input.draftBytes ?? null,
      input.finalStorageKey,
      input.finalBytes,
      input.promotedMediaAssetId,
      input.providerRequestId,
    ],
  )
}

export async function markMediaGenerationFailed(jobId: string, errorMessage: string): Promise<void> {
  await databasePool().query(
    `update media_generation_jobs
        set status = 'failed',
            error_message = $2,
            updated_at = now()
      where id = $1`,
    [jobId, errorMessage.slice(0, 2000)],
  )
}

export async function approveMediaGenerationDraft(jobId: string): Promise<MediaGenerationJob | null> {
  const result = await databasePool().query<MediaGenerationJobRow>(
    `update media_generation_jobs
        set status = 'queued',
            lane = 'final',
            progress_percent = 0,
            error_message = null,
            updated_at = now()
      where id = $1
        and status = 'draft_ready'
    returning ${SELECT_COLUMNS}`,
    [jobId],
  )
  return result.rows[0] ? mapJob(result.rows[0]) : null
}

export async function insertMediaAssetLineage(input: {
  mediaAssetId: string
  workspaceId: string
  sourceMediaAssetId: string | null
  sourceStartMs: number | null
  sourceEndMs: number | null
  generationJobId: string
  modelId: string
  prompt: string
  lockPackHash: string | null
}): Promise<void> {
  await databasePool().query(
    `insert into media_asset_lineage (
       id, media_asset_id, workspace_id, source_media_asset_id, source_start_ms, source_end_ms,
       generation_job_id, model_id, prompt, lock_pack_hash
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (media_asset_id) do nothing`,
    [
      randomUUID(),
      input.mediaAssetId,
      input.workspaceId,
      input.sourceMediaAssetId,
      input.sourceStartMs,
      input.sourceEndMs,
      input.generationJobId,
      input.modelId,
      input.prompt,
      input.lockPackHash,
    ],
  )
}
