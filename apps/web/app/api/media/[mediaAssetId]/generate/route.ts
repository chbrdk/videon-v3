import { apiError, apiJson } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import { findCut } from '@/lib/db/cuts'
import {
  buildGenerationIdempotencyKey,
  buildLockPackHash,
  countActiveGenerationJobsForWorkspace,
  createMediaGenerationJob,
  listMediaGenerationJobsForMedia,
} from '@/lib/db/media-generation'
import {
  buildQualityLockedPrompt,
  estimateGenerationCostUsd,
  publicGenerationModelsForUi,
  resolveEditModel,
} from '@/lib/generation/model-catalog'
import { enqueueMediaGenerateJob, pipelineQueueConfigured } from '@/lib/jobs/pg-boss-queue'
import { resolveMediaInWorkspace, resolveWorkspaceForMediaRequest } from '@/lib/media-access'
import { paths } from '@/lib/paths'
import { generationMaxConcurrent, generationMaxEditMs, isGenerationGatewayConfigured } from '@/lib/runtime-config'
import { requireSessionUserId } from '@/lib/session-user'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ mediaAssetId: string }> }

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

export async function GET(request: Request, context: RouteContext) {
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

  const { mediaAssetId } = await context.params
  const resolved = await resolveMediaInWorkspace({
    plexonUserId: userId,
    platformProjectId,
    mediaAssetId,
  })
  if (!resolved.ok) {
    const status =
      resolved.code === 'collection_access_denied' ? 403 : resolved.code === 'not_found' ? 404 : 503
    return apiError(request, status, resolved.code, 'Media asset unavailable', {
      retryable: resolved.code === 'dependency_unavailable',
    })
  }

  const jobs = await listMediaGenerationJobsForMedia(resolved.media.id)
  return apiJson(request, {
    jobs,
    models: publicGenerationModelsForUi('edit'),
    maxEditMs: generationMaxEditMs(),
    falConfigured: isGenerationGatewayConfigured(),
    generationConfigured: isGenerationGatewayConfigured(),
    gateway: 'openrouter',
  })
}

export async function POST(request: Request, context: RouteContext) {
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

  const { mediaAssetId } = await context.params
  const resolved = await resolveMediaInWorkspace({
    plexonUserId: userId,
    platformProjectId,
    mediaAssetId,
    writable: true,
  })
  if (!resolved.ok) {
    const status =
      resolved.code === 'collection_access_denied' ? 403 : resolved.code === 'not_found' ? 404 : 503
    return apiError(request, status, resolved.code, 'Media asset unavailable', {
      retryable: resolved.code === 'dependency_unavailable',
    })
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    body = {}
  }

  const intent = typeof body.intent === 'string' ? body.intent.trim() : 'edit'
  if (intent === 'create') {
    return apiError(request, 501, 'invalid_payload', 'intent=create is not available in Phase 1')
  }
  if (intent !== 'edit') {
    return apiError(request, 400, 'invalid_payload', 'intent must be edit or create')
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (!prompt || prompt.length > 4000) {
    return apiError(request, 400, 'invalid_payload', 'prompt is required (max 4000 chars)')
  }

  const startMs =
    typeof body.startMs === 'number' && Number.isFinite(body.startMs) ? Math.floor(body.startMs) : NaN
  const endMs =
    typeof body.endMs === 'number' && Number.isFinite(body.endMs) ? Math.floor(body.endMs) : NaN
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs <= startMs) {
    return apiError(request, 400, 'invalid_payload', 'startMs and endMs are required with endMs > startMs')
  }
  const durationMs = endMs - startMs
  const maxEditMs = generationMaxEditMs()
  if (durationMs < 1000 || durationMs > maxEditMs) {
    return apiError(
      request,
      400,
      'invalid_payload',
      `Edit range must be between 1000 and ${maxEditMs} ms`,
    )
  }

  const modelId = typeof body.modelId === 'string' ? body.modelId.trim() : 'seedance_2_0_mini_edit'
  const model = resolveEditModel(modelId)
  if (!model) {
    return apiError(request, 400, 'invalid_payload', `Unknown or unavailable modelId: ${modelId}`)
  }

  const skipDraft = body.skipDraft === true
  const keepSourceAudio = body.keepSourceAudio !== false
  const referenceImageUrls = parseReferenceUrls(body.referenceImageUrls)
  if (referenceImageUrls == null) {
    return apiError(request, 400, 'invalid_payload', 'referenceImageUrls must be ≤4 http(s) URLs')
  }
  const seed =
    typeof body.seed === 'number' && Number.isFinite(body.seed) ? Math.floor(body.seed) : null

  const cutIdRaw = typeof body.cutId === 'string' ? body.cutId.trim() : ''
  let targetCutId: string | null = null
  if (cutIdRaw) {
    const cut = await findCut(cutIdRaw)
    if (!cut || cut.workspaceId !== workspace.workspace.id) {
      return apiError(request, 404, 'not_found', 'Cut not found')
    }
    targetCutId = cut.id
  }

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
    startMs,
    midMs: Math.floor((startMs + endMs) / 2),
    endMs,
    preserve: ['camera', 'framing', 'lighting', 'background', 'people'],
    lockedPrompt: buildQualityLockedPrompt(prompt),
    resolutionDraft: '480p',
    resolutionFinal: model.defaultResolution,
    keepSourceAudio,
    referenceImageUrls,
    seed,
  }
  const lockPackHash = buildLockPackHash(lockPack)

  const idempotencyKey =
    (typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()) ||
    buildGenerationIdempotencyKey({
      mediaAssetId: resolved.media.id,
      intent: 'edit',
      startMs,
      endMs,
      prompt,
      modelId: model.id,
      skipDraft,
      keepSourceAudio,
      referenceImageUrls,
      seed,
    })

  const job = await createMediaGenerationJob({
    mediaAssetId: resolved.media.id,
    workspaceId: workspace.workspace.id,
    requestedByPlexonUserId: userId,
    intent: 'edit',
    lane: skipDraft ? 'final' : 'draft',
    modelId: model.id,
    prompt,
    startMs,
    endMs,
    skipDraft,
    keepSourceAudio,
    referenceImageUrls,
    seed,
    lockPack,
    lockPackHash,
    idempotencyKey,
    targetCutId,
  })

  if (job.status === 'queued') {
    await enqueueMediaGenerateJob({
      jobId: job.id,
      mediaAssetId: resolved.media.id,
    })
  }

  const estimate = estimateGenerationCostUsd({
    modelId: model.id,
    durationSeconds: Math.max(1, Math.round(durationMs / 1000)),
    skipDraft,
  })

  return apiJson(
    request,
    {
      job: {
        ...job,
        deepLink: paths.routes.mediaFor(resolved.media.id, platformProjectId),
        costEstimateUsd: estimate,
      },
    },
    202,
  )
}
