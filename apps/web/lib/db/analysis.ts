import { databasePool } from './client'
import {
  analysisInputFingerprint,
  DEFAULT_REQUESTED_CAPABILITIES,
  PIPELINE_VERSION,
  type PipelineStageKey,
} from '@/lib/pipeline/constants'
import { SCENE_INSIGHT_SCHEMA_VERSION } from '@/lib/vision-schema'
import type { SceneInsight } from '@/lib/vision-schema'
import { randomUUID } from 'node:crypto'

export const ANALYSIS_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number]

export const STAGE_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const
export type StageStatus = (typeof STAGE_STATUSES)[number]

export type AnalysisRun = {
  id: string
  mediaAssetId: string
  requestedByPlexonUserId: string
  pipelineVersion: string
  sceneSchemaVersion: string
  requestedCapabilities: string[]
  inputFingerprint: string
  idempotencyKey: string
  status: AnalysisStatus
  createdAt: string
  updatedAt: string
  startedAt: string | null
  finishedAt: string | null
}

export type AnalysisStageRun = {
  id: string
  analysisRunId: string
  stageKey: PipelineStageKey
  inputFingerprint: string
  status: StageStatus
  attempt: number
  progressCompleted: number
  progressTotal: number
  errorCode: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

type AnalysisRow = {
  id: string
  media_asset_id: string
  requested_by_plexon_user_id: string
  pipeline_version: string
  scene_schema_version: string
  requested_capabilities: string[] | unknown
  input_fingerprint: string
  idempotency_key: string
  status: AnalysisStatus
  created_at: Date | string
  updated_at: Date | string
  started_at: Date | string | null
  finished_at: Date | string | null
}

type StageRow = {
  id: string
  analysis_run_id: string
  stage_key: PipelineStageKey
  input_fingerprint: string
  status: StageStatus
  attempt: number
  progress_completed: number
  progress_total: number
  error_code: string | null
  error_message: string | null
  created_at: Date | string
  updated_at: Date | string
}

function mapAnalysis(row: AnalysisRow): AnalysisRun {
  return {
    id: row.id,
    mediaAssetId: row.media_asset_id,
    requestedByPlexonUserId: row.requested_by_plexon_user_id,
    pipelineVersion: row.pipeline_version,
    sceneSchemaVersion: row.scene_schema_version,
    requestedCapabilities: Array.isArray(row.requested_capabilities)
      ? row.requested_capabilities.map(String)
      : [],
    inputFingerprint: row.input_fingerprint,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
  }
}

function mapStage(row: StageRow): AnalysisStageRun {
  return {
    id: row.id,
    analysisRunId: row.analysis_run_id,
    stageKey: row.stage_key,
    inputFingerprint: row.input_fingerprint,
    status: row.status,
    attempt: row.attempt,
    progressCompleted: row.progress_completed,
    progressTotal: row.progress_total,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

export async function findAnalysisRun(analysisRunId: string): Promise<AnalysisRun | null> {
  const result = await databasePool().query<AnalysisRow>(
    `select id, media_asset_id, requested_by_plexon_user_id, pipeline_version, scene_schema_version,
            requested_capabilities, input_fingerprint, idempotency_key, status,
            created_at, updated_at, started_at, finished_at
       from analysis_runs
      where id = $1`,
    [analysisRunId],
  )
  return result.rows[0] ? mapAnalysis(result.rows[0]) : null
}

export async function listAnalysisRunsForWorkspace(workspaceId: string): Promise<
  Array<
    AnalysisRun & {
      mediaFilename: string
      mediaLifecycleState: string
      failedStageKey: string | null
      failedStageMessage: string | null
    }
  >
> {
  const result = await databasePool().query<
    AnalysisRow & {
      original_filename: string
      lifecycle_state: string
      failed_stage_key: string | null
      failed_stage_message: string | null
    }
  >(
    `select ar.id, ar.media_asset_id, ar.requested_by_plexon_user_id, ar.pipeline_version,
            ar.scene_schema_version, ar.requested_capabilities, ar.input_fingerprint,
            ar.idempotency_key, ar.status, ar.created_at, ar.updated_at, ar.started_at, ar.finished_at,
            ma.original_filename, ma.lifecycle_state,
            failed_stage.stage_key as failed_stage_key,
            failed_stage.error_message as failed_stage_message
       from analysis_runs ar
       join media_assets ma on ma.id = ar.media_asset_id
       left join lateral (
         select stage_key, error_message
           from analysis_stage_runs
          where analysis_run_id = ar.id
            and status = 'failed'
          order by updated_at desc
          limit 1
       ) failed_stage on true
      where ma.workspace_id = $1
      order by ar.created_at desc
      limit 100`,
    [workspaceId],
  )
  return result.rows.map((row) => ({
    ...mapAnalysis(row),
    mediaFilename: row.original_filename,
    mediaLifecycleState: row.lifecycle_state,
    failedStageKey: row.failed_stage_key,
    failedStageMessage: row.failed_stage_message,
  }))
}

export async function listRecentFailedPipelineStages(limit = 5): Promise<
  Array<{
    analysisRunId: string
    mediaFilename: string
    stageKey: string
    errorMessage: string | null
    updatedAt: string
  }>
> {
  const result = await databasePool().query<{
    analysis_run_id: string
    original_filename: string
    stage_key: string
    error_message: string | null
    updated_at: Date
  }>(
    `select s.analysis_run_id, ma.original_filename, s.stage_key, s.error_message, s.updated_at
       from analysis_stage_runs s
       join analysis_runs ar on ar.id = s.analysis_run_id
       join media_assets ma on ma.id = ar.media_asset_id
      where s.status = 'failed'
      order by s.updated_at desc
      limit $1`,
    [limit],
  )
  return result.rows.map((row) => ({
    analysisRunId: row.analysis_run_id,
    mediaFilename: row.original_filename,
    stageKey: row.stage_key,
    errorMessage: row.error_message,
    updatedAt: new Date(row.updated_at).toISOString(),
  }))
}

export async function listStagesForAnalysis(analysisRunId: string): Promise<AnalysisStageRun[]> {
  const result = await databasePool().query<StageRow>(
    `select id, analysis_run_id, stage_key, input_fingerprint, status, attempt,
            progress_completed, progress_total, error_code, error_message, created_at, updated_at
       from analysis_stage_runs
      where analysis_run_id = $1
      order by created_at asc`,
    [analysisRunId],
  )
  return result.rows.map(mapStage)
}

export async function createRerunAnalysisForMedia(input: {
  mediaAssetId: string
  requestedByPlexonUserId: string
  checksumSha256: string
}): Promise<AnalysisRun> {
  const fingerprint = analysisInputFingerprint(input.checksumSha256)
  const idempotencyKey = `rerun:${input.mediaAssetId}:${randomUUID()}`

  await databasePool().query(
    `update analysis_runs
        set status = 'cancelled',
            finished_at = coalesce(finished_at, now()),
            updated_at = now()
      where media_asset_id = $1
        and status in ('queued', 'running')`,
    [input.mediaAssetId],
  )

  const id = randomUUID()
  const result = await databasePool().query<AnalysisRow>(
    `insert into analysis_runs (
       id, media_asset_id, requested_by_plexon_user_id, pipeline_version, scene_schema_version,
       requested_capabilities, input_fingerprint, idempotency_key, status
     ) values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, 'queued')
     returning id, media_asset_id, requested_by_plexon_user_id, pipeline_version, scene_schema_version,
               requested_capabilities, input_fingerprint, idempotency_key, status,
               created_at, updated_at, started_at, finished_at`,
    [
      id,
      input.mediaAssetId,
      input.requestedByPlexonUserId,
      PIPELINE_VERSION,
      SCENE_INSIGHT_SCHEMA_VERSION,
      JSON.stringify([...DEFAULT_REQUESTED_CAPABILITIES]),
      fingerprint,
      idempotencyKey,
    ],
  )
  return mapAnalysis(result.rows[0])
}

export async function findLatestAnalysisForMedia(mediaAssetId: string): Promise<AnalysisRun | null> {
  const result = await databasePool().query<AnalysisRow>(
    `select id, media_asset_id, requested_by_plexon_user_id, pipeline_version, scene_schema_version,
            requested_capabilities, input_fingerprint, idempotency_key, status,
            created_at, updated_at, started_at, finished_at
       from analysis_runs
      where media_asset_id = $1
      order by created_at desc
      limit 1`,
    [mediaAssetId],
  )
  return result.rows[0] ? mapAnalysis(result.rows[0]) : null
}

export type SceneInsightRecord = {
  sceneKey: string
  startMs: number
  endMs: number
  insight: SceneInsight
}

export async function listSceneInsightsForAnalysis(analysisRunId: string): Promise<SceneInsightRecord[]> {
  const result = await databasePool().query<{
    scene_key: string
    start_ms: number
    end_ms: number
    insight: SceneInsight
  }>(
    `select scene_key, start_ms, end_ms, insight
       from scene_insights
      where analysis_run_id = $1
      order by start_ms asc`,
    [analysisRunId],
  )
  return result.rows.map((row) => ({
    sceneKey: row.scene_key,
    startMs: row.start_ms,
    endMs: row.end_ms,
    insight: row.insight,
  }))
}

export async function createAnalysisRunForMedia(input: {
  mediaAssetId: string
  requestedByPlexonUserId: string
  checksumSha256: string
}): Promise<AnalysisRun> {
  const fingerprint = analysisInputFingerprint(input.checksumSha256)
  const idempotencyKey = `auto:${input.mediaAssetId}:${PIPELINE_VERSION}`
  const existing = await databasePool().query<AnalysisRow>(
    `select id, media_asset_id, requested_by_plexon_user_id, pipeline_version, scene_schema_version,
            requested_capabilities, input_fingerprint, idempotency_key, status,
            created_at, updated_at, started_at, finished_at
       from analysis_runs
      where media_asset_id = $1
        and pipeline_version = $2
        and input_fingerprint = $3
        and idempotency_key = $4
        and status in ('queued', 'running', 'succeeded')
      limit 1`,
    [input.mediaAssetId, PIPELINE_VERSION, fingerprint, idempotencyKey],
  )
  if (existing.rows[0]) return mapAnalysis(existing.rows[0])

  const failed = await databasePool().query<AnalysisRow>(
    `update analysis_runs
        set status = 'queued',
            started_at = null,
            finished_at = null,
            updated_at = now()
      where media_asset_id = $1
        and pipeline_version = $2
        and input_fingerprint = $3
        and idempotency_key = $4
        and status = 'failed'
      returning id, media_asset_id, requested_by_plexon_user_id, pipeline_version, scene_schema_version,
                requested_capabilities, input_fingerprint, idempotency_key, status,
                created_at, updated_at, started_at, finished_at`,
    [input.mediaAssetId, PIPELINE_VERSION, fingerprint, idempotencyKey],
  )
  if (failed.rows[0]) return mapAnalysis(failed.rows[0])

  const id = randomUUID()
  const result = await databasePool().query<AnalysisRow>(
    `insert into analysis_runs (
       id, media_asset_id, requested_by_plexon_user_id, pipeline_version, scene_schema_version,
       requested_capabilities, input_fingerprint, idempotency_key, status
     ) values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, 'queued')
     returning id, media_asset_id, requested_by_plexon_user_id, pipeline_version, scene_schema_version,
               requested_capabilities, input_fingerprint, idempotency_key, status,
               created_at, updated_at, started_at, finished_at`,
    [
      id,
      input.mediaAssetId,
      input.requestedByPlexonUserId,
      PIPELINE_VERSION,
      SCENE_INSIGHT_SCHEMA_VERSION,
      JSON.stringify([...DEFAULT_REQUESTED_CAPABILITIES]),
      fingerprint,
      idempotencyKey,
    ],
  )
  return mapAnalysis(result.rows[0])
}

export async function markAnalysisRunning(analysisRunId: string): Promise<void> {
  await databasePool().query(
    `update analysis_runs
        set status = 'running',
            started_at = coalesce(started_at, now()),
            updated_at = now()
      where id = $1`,
    [analysisRunId],
  )
}

export async function markAnalysisFinished(
  analysisRunId: string,
  status: 'succeeded' | 'failed' | 'cancelled',
): Promise<void> {
  await databasePool().query(
    `update analysis_runs
        set status = $2,
            finished_at = now(),
            updated_at = now()
      where id = $1`,
    [analysisRunId, status],
  )
}

export async function upsertStageRun(input: {
  analysisRunId: string
  stageKey: PipelineStageKey
  inputFingerprint: string
  status: StageStatus
  progressCompleted?: number
  progressTotal?: number
  errorCode?: string | null
  errorMessage?: string | null
}): Promise<AnalysisStageRun> {
  const id = randomUUID()
  const result = await databasePool().query<StageRow>(
    `insert into analysis_stage_runs (
       id, analysis_run_id, stage_key, input_fingerprint, status, attempt,
       progress_completed, progress_total, error_code, error_message, started_at, finished_at
     ) values ($1, $2, $3, $4, $5, 0, $6, $7, $8, $9,
               case when $5 = 'running' then now() else null end,
               case when $5 in ('succeeded', 'failed', 'cancelled') then now() else null end)
     on conflict (analysis_run_id, stage_key, input_fingerprint)
     do update set
       status = excluded.status,
       progress_completed = excluded.progress_completed,
       progress_total = excluded.progress_total,
       error_code = excluded.error_code,
       error_message = excluded.error_message,
       attempt = analysis_stage_runs.attempt + case when analysis_stage_runs.status <> excluded.status then 1 else 0 end,
       started_at = coalesce(analysis_stage_runs.started_at, excluded.started_at),
       finished_at = case when excluded.status in ('succeeded', 'failed', 'cancelled') then now() else analysis_stage_runs.finished_at end,
       updated_at = now()
     returning id, analysis_run_id, stage_key, input_fingerprint, status, attempt,
               progress_completed, progress_total, error_code, error_message, created_at, updated_at`,
    [
      id,
      input.analysisRunId,
      input.stageKey,
      input.inputFingerprint,
      input.status,
      input.progressCompleted ?? 0,
      input.progressTotal ?? 0,
      input.errorCode ?? null,
      input.errorMessage ?? null,
    ],
  )
  return mapStage(result.rows[0])
}

export async function insertSceneInsight(input: {
  analysisRunId: string
  sceneKey: string
  startMs: number
  endMs: number
  frameRefs: unknown
  insight: SceneInsight
  requestedModel: string
  actualModel: string
  provider: string | null
  openrouterRequestId: string | null
  promptVersion: string
  promptTokens: number | null
  completionTokens: number | null
  reasoningTokens: number | null
  cachedTokens: number | null
  providerCostUsd: string | null
}): Promise<void> {
  await databasePool().query(
    `insert into scene_insights (
       id, analysis_run_id, scene_key, start_ms, end_ms, frame_refs, insight, schema_version,
       requested_model, actual_model, provider, openrouter_request_id, prompt_version,
       prompt_tokens, completion_tokens, reasoning_tokens, cached_tokens, provider_cost_usd
     ) values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     on conflict (analysis_run_id, scene_key, schema_version)
     do update set
       start_ms = excluded.start_ms,
       end_ms = excluded.end_ms,
       frame_refs = excluded.frame_refs,
       insight = excluded.insight,
       requested_model = excluded.requested_model,
       actual_model = excluded.actual_model,
       provider = excluded.provider,
       openrouter_request_id = excluded.openrouter_request_id,
       prompt_version = excluded.prompt_version,
       prompt_tokens = excluded.prompt_tokens,
       completion_tokens = excluded.completion_tokens,
       reasoning_tokens = excluded.reasoning_tokens,
       cached_tokens = excluded.cached_tokens,
       provider_cost_usd = excluded.provider_cost_usd`,
    [
      randomUUID(),
      input.analysisRunId,
      input.sceneKey,
      input.startMs,
      input.endMs,
      JSON.stringify(input.frameRefs),
      JSON.stringify(input.insight),
      input.insight.schemaVersion,
      input.requestedModel,
      input.actualModel,
      input.provider,
      input.openrouterRequestId,
      input.promptVersion,
      input.promptTokens,
      input.completionTokens,
      input.reasoningTokens,
      input.cachedTokens,
      input.providerCostUsd,
    ],
  )
}
