import { randomUUID } from 'node:crypto'
import { apiError, apiJson } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import { createCutExport, listCutExportsForCut } from '@/lib/db/cut-exports'
import { findCut } from '@/lib/db/cuts'
import { enqueueCutExportJob, pipelineQueueConfigured } from '@/lib/jobs/pg-boss-queue'
import { requireSessionUserId } from '@/lib/session-user'
import { resolveWorkspaceForMediaRequest } from '@/lib/media-access'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ cutId: string }> }

async function resolveCutAccess(request: Request, cutId: string, writable = false) {
  const userId = await requireSessionUserId()
  if (!userId) return { error: apiError(request, 401, 'service_unauthorized', 'Authentication required') }
  if (!hasDatabaseConfig()) {
    return {
      error: apiError(request, 503, 'dependency_unavailable', 'Workspace persistence is unavailable', {
        retryable: true,
      }),
    }
  }

  const platformProjectId = new URL(request.url).searchParams.get('platformProjectId')?.trim() || ''
  if (!platformProjectId) {
    return { error: apiError(request, 400, 'invalid_payload', 'platformProjectId is required') }
  }

  const workspace = await resolveWorkspaceForMediaRequest({
    plexonUserId: userId,
    platformProjectId,
    writable,
  })
  if (!workspace.ok) {
    const status =
      workspace.code === 'collection_access_denied' ? 403 : workspace.code === 'not_found' ? 404 : 503
    return {
      error: apiError(request, status, workspace.code, 'Collection workspace unavailable', {
        retryable: workspace.code === 'dependency_unavailable',
      }),
    }
  }

  const cut = await findCut(cutId.trim())
  if (!cut || cut.workspaceId !== workspace.workspace.id) {
    return { error: apiError(request, 404, 'not_found', 'Cut not found') }
  }

  return { userId, cut }
}

export async function GET(request: Request, context: RouteContext) {
  const { cutId } = await context.params
  const resolved = await resolveCutAccess(request, cutId)
  if ('error' in resolved) return resolved.error
  const exports = await listCutExportsForCut(resolved.cut.id)
  return apiJson(request, { exports })
}

export async function POST(request: Request, context: RouteContext) {
  const { cutId } = await context.params
  const resolved = await resolveCutAccess(request, cutId, true)
  if ('error' in resolved) return resolved.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const record = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
  const idempotencyKey =
    typeof record.idempotencyKey === 'string' && record.idempotencyKey.trim()
      ? record.idempotencyKey.trim()
      : randomUUID()

  const exportJob = await createCutExport({
    cutId: resolved.cut.id,
    workspaceId: resolved.cut.workspaceId,
    requestedByPlexonUserId: resolved.userId,
    idempotencyKey,
  })

  if (!pipelineQueueConfigured()) {
    return apiError(request, 503, 'dependency_unavailable', 'Export queue is unavailable', { retryable: true })
  }

  await enqueueCutExportJob({ exportId: exportJob.id, cutId: resolved.cut.id })
  return apiJson(request, { export: exportJob }, 202)
}
