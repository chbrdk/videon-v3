import { apiError, apiJson } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import { insertCutClientRoomApproval } from '@/lib/db/cut-client-room-approvals'
import { findCut } from '@/lib/db/cuts'
import { evaluateCutClientRoomBrandGate } from '@/lib/cut-client-room-approve'
import { resolveWorkspaceForMediaRequest } from '@/lib/media-access'
import { paths } from '@/lib/paths'
import {
  CLIENT_ROOM_SLOT_VIDEON_CUT,
  putClientRoomSlot,
} from '@/lib/plexon-client-room'
import { scheduleSuiteAuditEvent } from '@/lib/plexon-suite-audit'
import { requireSessionUserId } from '@/lib/session-user'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ cutId: string }> }

/**
 * Explicit Export-Freigabe → ClientRoom slot `videon_cut`.
 * Spec: suite-enterprise-program.md § E2 — brand-check gate required.
 */
export async function POST(request: Request, context: RouteContext) {
  const userId = await requireSessionUserId()
  if (!userId) {
    return apiError(request, 401, 'service_unauthorized', 'Authentication required')
  }
  if (!hasDatabaseConfig()) {
    return apiError(request, 503, 'dependency_unavailable', 'Workspace persistence is unavailable', {
      retryable: true,
    })
  }

  const { cutId } = await context.params
  const platformProjectId = new URL(request.url).searchParams.get('platformProjectId')?.trim() || ''
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

  const cut = await findCut(cutId.trim())
  if (!cut || cut.workspaceId !== workspace.workspace.id) {
    return apiError(request, 404, 'not_found', 'Cut not found')
  }

  const gate = await evaluateCutClientRoomBrandGate(cut)
  if (!gate.ok) {
    return apiError(request, 409, 'invalid_payload', `ClientRoom freigabe blocked: ${gate.code}`, {
      details: { gate: gate.code },
    })
  }

  const approval = await insertCutClientRoomApproval({
    cutId: cut.id,
    workspaceId: cut.workspaceId,
    exportId: gate.exportJob.id,
    approvedByPlexonUserId: userId,
    guidelineId: gate.guidelineId,
    guidelineVersion: gate.guidelineVersion,
    analysisRunIds: gate.analysisRunIds,
    brandStatus: gate.brandStatus,
  })

  const publicBase = (process.env[paths.envVideonPublicUrl] ?? '').replace(/\/$/, '')
  const href = publicBase
    ? `${publicBase}${paths.routes.cutFor(cut.id, platformProjectId)}`
    : paths.routes.cutFor(cut.id, platformProjectId)

  const clientRoomPublished = await putClientRoomSlot({
    platformProjectId,
    slotId: CLIENT_ROOM_SLOT_VIDEON_CUT,
    productId: 'videon',
    subjectRef: cut.id,
    title: cut.name || 'Cut',
    href,
    actorUserId: userId,
  })

  scheduleSuiteAuditEvent({
    platformProjectId,
    productId: 'videon',
    action: 'approved',
    actorUserId: userId,
    subjectRef: cut.id,
    meta: {
      exportId: gate.exportJob.id,
      guidelineId: gate.guidelineId,
      guidelineVersion: gate.guidelineVersion,
      analysisRunIds: gate.analysisRunIds,
      clientRoomPublished,
    },
  })

  return apiJson(request, {
    approval,
    clientRoomPublished,
    slotId: CLIENT_ROOM_SLOT_VIDEON_CUT,
  })
}
