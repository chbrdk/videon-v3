import { apiError, apiJson } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import { findCutExport } from '@/lib/db/cut-exports'
import { findCut } from '@/lib/db/cuts'
import { requireSessionUserId } from '@/lib/session-user'
import { resolveWorkspaceForMediaRequest } from '@/lib/media-access'
import { S3ObjectStore } from '@/lib/storage/s3-object-store'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ cutId: string; exportId: string }> }

export async function GET(request: Request, context: RouteContext) {
  const userId = await requireSessionUserId()
  if (!userId) return apiError(request, 401, 'service_unauthorized', 'Authentication required')
  if (!hasDatabaseConfig()) {
    return apiError(request, 503, 'dependency_unavailable', 'Workspace persistence is unavailable', {
      retryable: true,
    })
  }

  const platformProjectId = new URL(request.url).searchParams.get('platformProjectId')?.trim() || ''
  if (!platformProjectId) {
    return apiError(request, 400, 'invalid_payload', 'platformProjectId is required')
  }

  const workspace = await resolveWorkspaceForMediaRequest({
    plexonUserId: userId,
    platformProjectId,
  })
  if (!workspace.ok) {
    const status =
      workspace.code === 'collection_access_denied' ? 403 : workspace.code === 'not_found' ? 404 : 503
    return apiError(request, status, workspace.code, 'Collection workspace unavailable', {
      retryable: workspace.code === 'dependency_unavailable',
    })
  }

  const { cutId, exportId } = await context.params
  const cut = await findCut(cutId.trim())
  if (!cut || cut.workspaceId !== workspace.workspace.id) {
    return apiError(request, 404, 'not_found', 'Cut not found')
  }

  const exportJob = await findCutExport(exportId.trim())
  if (!exportJob || exportJob.cutId !== cut.id || exportJob.workspaceId !== workspace.workspace.id) {
    return apiError(request, 404, 'not_found', 'Export not found')
  }

  let downloadUrl: string | null = null
  if (exportJob.status === 'succeeded' && exportJob.storageKey) {
    const store = new S3ObjectStore()
    const target = await store.createDownloadTarget({
      workspaceId: workspace.workspace.id,
      mediaAssetId: exportJob.id,
      storageKey: exportJob.storageKey,
      filename: `${cut.name}.mp4`,
      disposition: 'attachment',
    })
    downloadUrl = target.uploadUrl
  }

  return apiJson(request, { export: exportJob, downloadUrl })
}
