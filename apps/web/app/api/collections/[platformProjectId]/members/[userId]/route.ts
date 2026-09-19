import { apiError, apiJson } from '@/lib/api-response'
import { revokeCollectionMemberOnPlexon } from '@/lib/collection-members-plexon'
import {
  authorizeCollectionTeamRequest,
  denialResponse,
  upstreamTeamError,
} from '@/lib/collection-team-access'

export const dynamic = 'force-dynamic'

export async function DELETE(
  request: Request,
  context: { params: Promise<{ platformProjectId: string; userId: string }> },
) {
  const { platformProjectId, userId } = await context.params
  const access = await authorizeCollectionTeamRequest(platformProjectId)
  if (!access.ok) return denialResponse(request, access.denial)

  const memberUserId = userId.trim()
  if (!memberUserId) {
    return apiError(request, 400, 'invalid_payload', 'userId is required')
  }

  const result = await revokeCollectionMemberOnPlexon({
    platformProjectId: access.platformProjectId,
    plexonUserId: access.plexonUserId,
    memberUserId,
  })
  if (!result.ok) return upstreamTeamError(request, result)

  return apiJson(request, { ok: true })
}
