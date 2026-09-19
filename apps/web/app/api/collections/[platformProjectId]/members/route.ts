import { apiError, apiJson } from '@/lib/api-response'
import {
  addCollectionMemberOnPlexon,
  fetchCollectionMembersFromPlexon,
} from '@/lib/collection-members-plexon'
import {
  authorizeCollectionTeamRequest,
  denialResponse,
  upstreamTeamError,
} from '@/lib/collection-team-access'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  context: { params: Promise<{ platformProjectId: string }> },
) {
  const { platformProjectId } = await context.params
  const access = await authorizeCollectionTeamRequest(platformProjectId)
  if (!access.ok) return denialResponse(request, access.denial)

  const remote = await fetchCollectionMembersFromPlexon({
    platformProjectId: access.platformProjectId,
    plexonUserId: access.plexonUserId,
  })
  if (!remote.ok) return upstreamTeamError(request, remote)

  return apiJson(request, {
    source: 'plexon',
    items: remote.items.map((member) => ({
      id: member.userId,
      email: member.email,
      name: member.name,
      role: member.role,
      status: member.source === 'creator' ? 'owner' : 'active',
      source: member.source,
    })),
  })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ platformProjectId: string }> },
) {
  const { platformProjectId } = await context.params
  const access = await authorizeCollectionTeamRequest(platformProjectId)
  if (!access.ok) return denialResponse(request, access.denial)

  let body: { email?: unknown; role?: unknown } = {}
  try {
    body = (await request.json()) as typeof body
  } catch {
    body = {}
  }
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  if (!email) {
    return apiError(request, 400, 'invalid_payload', 'email is required')
  }

  const result = await addCollectionMemberOnPlexon({
    platformProjectId: access.platformProjectId,
    plexonUserId: access.plexonUserId,
    email,
    role: body.role === 'admin' ? 'admin' : 'member',
  })
  if (!result.ok) return upstreamTeamError(request, result)

  return apiJson(request, result)
}
