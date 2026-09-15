import { apiError, apiJson } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import {
  buildGenerationIdempotencyKey,
  buildLockPackHash,
  countActiveGenerationJobsForWorkspace,
  createMediaGenerationJob,
  listMediaGenerationJobsForWorkspace,
} from '@/lib/db/media-generation'
import {
  estimateGenerationCostUsd,
  publicGenerationModelsForUi,
  resolveCreateModel,
} from '@/lib/generation/model-catalog'
import { enqueueMediaGenerateJob, pipelineQueueConfigured } from '@/lib/jobs/pg-boss-queue'
import { resolveWorkspaceForMediaRequest } from '@/lib/media-access'
import { paths } from '@/lib/paths'
import { generationMaxConcurrent, isGenerationGatewayConfigured } from '@/lib/runtime-config'
import { requireSessionUserId } from '@/lib/session-user'

export const dynamic = 'force-dynamic'

function platformProjectIdFrom(request: Request): string {
  return new URL(request.url).searchParams.get('platformProjectId')?.trim() || ''
}

function parseReferenceUrls(value: unknown): string[] | null {
  if (value == null) return []
  if (!Array.isArray(value)) return null
  const urls: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') return null
    const trimmed = item.trim()
    if (!trimmed) continue
    if (!/^https?:\/\//i.test(trimmed)) return null
    urls.push(trimmed)
    if (urls.length > 4) return null
  }
  return urls
}

export async function GET(request: Request) {
  const userId = await requireSessionUserId()
  if (!userId) return apiError(request, 401, 'service_unauthorized', 'Authentication required')
  if (!hasDatabaseConfig()) {
    return apiError(request, 503, 'dependency_unavailable', 'Workspace persistence is unavailable', {
      retryable: true,
    })
  }

  const platformProjectId = platformProjectIdFrom(request)
  if (!platformProjectId) {
    return apiError(request, 400, 'invalid_payload', 'platformProjectId is required')
  }

  const workspace = await resolveWorkspaceForMediaRequest({
    plexonUserId: userId,
    platformProjectId,
    writable: false,
  })
  if (!workspace.ok) {
    const status =
      workspace.code === 'collection_access_denied' ? 403 : workspace.code === 'not_found' ? 404 : 503
    return apiError(request, status, workspace.code, 'Collection workspace unavailable', {
      retryable: workspace.code === 'dependency_unavailable',
    })
  }

  const jobs = await listMediaGenerationJobsForWorkspace(workspace.workspace.id)
  return apiJson(request, {
    jobs: jobs.filter((job) => job.intent === 'create'),
    models: publicGenerationModelsForUi('create'),
    falConfigured: isGenerationGatewayConfigured(),
    generationConfigured: isGenerationGatewayConfigured(),
    gateway: 'openrouter',
  })
}

export async function POST(request: Request) {
  const userId = await requireSessionUserId()
  if (!userId) return apiError(request, 401, 'service_unauthorized', 'Authentication required')
  if (!hasDatabaseConfig()) {
    return apiError(request, 503, 'dependency_unavailable', 'Workspace persistence is unavailable', {
      retryable: true,
    })
  }
  if (!pipelineQueueConfigured()) {
    return apiError(request, 503, 'dependency_unavailable', 'Job queue is unavailable', { retryable: true })
  }

  const platformProjectId = platformProjectIdFrom(request)
  if (!platformProjectId) {
    return apiError(request, 400, 'invalid_payload', 'platformProjectId is required')
  }

  const workspace = await resolveWorkspaceForMediaRequest({
    plexonUserId: userId,
    platformProjectId,
    writable: true,
  })
  if (!workspace.ok) {
    const status =
      workspace.code === 'collection_access_denied' ? 403 : workspace.code === 'not_found' ? 404 : 503
    return apiError(request, status, workspace.code, 'Collection workspace unavailable', {
      retryable: workspace.code === 'dependency_unavailable',
    })
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    body = {}
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (!prompt || prompt.length > 4000) {
    return apiError(request, 400, 'invalid_payload', 'prompt is required (max 4000 chars)')
  }

  const modelId = typeof body.modelId === 'string' ? body.modelId.trim() : 'seedance_2_5_t2v'
  const model = resolveCreateModel(modelId)
  if (!model) {
    return apiError(request, 400, 'invalid_payload', `Unknown or unavailable create modelId: ${modelId}`)
  }

  const durationSeconds =
    typeof body.durationSeconds === 'number' && Number.isFinite(body.durationSeconds)
      ? Math.min(30, Math.max(4, Math.floor(body.durationSeconds)))
      : 5
  const aspectRaw = typeof body.aspectRatio === 'string' ? body.aspectRatio.trim() : '16:9'
  const aspectRatio = (['16:9', '9:16', '1:1'] as const).includes(aspectRaw as '16:9')
    ? aspectRaw
    : '16:9'
  const referenceImageUrls = parseReferenceUrls(body.referenceImageUrls)
  if (referenceImageUrls == null) {
    return apiError(request, 400, 'invalid_payload', 'referenceImageUrls must be ≤4 http(s) URLs')
  }
  const seed =
    typeof body.seed === 'number' && Number.isFinite(body.seed) ? Math.floor(body.seed) : null

  const active = await countActiveGenerationJobsForWorkspace(workspace.workspace.id)
  if (active >= generationMaxConcurrent()) {
    return apiError(
      request,
      429,
      'invalid_payload',
      `Too many active generation jobs (max ${generationMaxConcurrent()})`,
      { retryable: true },
    )
  }

  const lockPack = {
    version: 1,
    intent: 'create',
    durationSeconds,
    aspectRatio,
    referenceImageUrls,
    seed,
  }
  const lockPackHash = buildLockPackHash(lockPack)
  const idempotencyKey =
    (typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()) ||
    buildGenerationIdempotencyKey({
      mediaAssetId: `create:${workspace.workspace.id}`,
      intent: 'create',
      startMs: null,
      endMs: null,
      prompt,
      modelId: model.id,
      skipDraft: true,
      keepSourceAudio: false,
      referenceImageUrls,
      seed,
    })

  const job = await createMediaGenerationJob({
    mediaAssetId: null,
    workspaceId: workspace.workspace.id,
    requestedByPlexonUserId: userId,
    intent: 'create',
    lane: 'final',
    modelId: model.id,
    prompt,
    startMs: null,
    endMs: null,
    durationSeconds,
    aspectRatio,
    skipDraft: true,
    keepSourceAudio: false,
    referenceImageUrls,
    seed,
    lockPack,
    lockPackHash,
    idempotencyKey,
  })

  if (job.status === 'queued') {
    await enqueueMediaGenerateJob({
      jobId: job.id,
      mediaAssetId: job.promotedMediaAssetId || `create:${job.id}`,
    })
  }

  const estimate = estimateGenerationCostUsd({
    modelId: model.id,
    durationSeconds,
    skipDraft: true,
  })

  return apiJson(
    request,
    {
      job: {
        ...job,
        deepLink: paths.routes.libraryFor(platformProjectId),
        costEstimateUsd: estimate,
      },
    },
    202,
  )
}
