import { apiJson } from '@/lib/api-response'
import { createCollectionInviteOnPlexon } from '@/lib/collection-members-plexon'
import {
  authorizeCollectionTeamRequest,
  denialResponse,
  upstreamTeamError,
} from '@/lib/collection-team-access'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  context: { params: Promise<{ platformProjectId: string }> },
) {
  const { platformProjectId } = await context.params
  const access = await authorizeCollectionTeamRequest(platformProjectId)
  if (!access.ok) return denialResponse(request, access.denial)

  let body: { role?: unknown } = {}
  try {
    body = (await request.json()) as typeof body
  } catch {
    body = {}
  }

  const result = await createCollectionInviteOnPlexon({
    platformProjectId: access.platformProjectId,
    plexonUserId: access.plexonUserId,
    role: body.role === 'admin' ? 'admin' : 'member',
  })
  if (!result.ok) return upstreamTeamError(request, result)

  return apiJson(request, result)
}
