/**
 * Collection team roster / invites from PLEXON — the SSOT for Access Model B assignments.
 * VIDEON never writes membership here; `videon_workspace_members` stays a replay projection
 * fed by the PLEXON provisioning body. Spec: `specs/domain/project-team.md`.
 */

import {
  PLEXON_CONTRACT_VERSION_HEADER,
  PLEXON_FEDERATION_CONTRACT_VERSION,
  PLEXON_SERVICE_SECRET_HEADER,
  PLEXON_USER_HEADER,
} from '@videon-v3/contracts'
import { paths } from './paths'
import { isRealPlatformProjectId } from './plexon-platform-id'
import {
  federationMode,
  isLiveFederationConfigured,
  plexonBaseUrl,
  plexonServiceSecret,
} from './runtime-config'

export type CollectionMemberDto = {
  userId: string
  email: string
  name: string | null
  role: 'admin' | 'member'
  source: 'creator' | 'assignment'
}

export type PlexonTeamFailure = { ok: false; status: number; error: string }

function federationHeaders(plexonUserId: string): HeadersInit {
  return {
    [PLEXON_CONTRACT_VERSION_HEADER]: PLEXON_FEDERATION_CONTRACT_VERSION,
    [PLEXON_SERVICE_SECRET_HEADER]: plexonServiceSecret(),
    [PLEXON_USER_HEADER]: plexonUserId,
  }
}

function federationReady(platformProjectId: string): boolean {
  return (
    isRealPlatformProjectId(platformProjectId) &&
    federationMode() === 'live' &&
    isLiveFederationConfigured()
  )
}

function collectionUrl(path: string): string {
  return `${plexonBaseUrl().replace(/\/$/, '')}${path}`
}

function parseMember(raw: Record<string, unknown>): CollectionMemberDto | null {
  const userId = typeof raw.userId === 'string' ? raw.userId.trim() : ''
  const email = typeof raw.email === 'string' ? raw.email.trim() : ''
  if (!userId || !email) return null
  return {
    userId,
    email,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : null,
    role: raw.role === 'admin' ? 'admin' : 'member',
    source: raw.source === 'creator' ? 'creator' : 'assignment',
  }
}

export async function fetchCollectionMembersFromPlexon(input: {
  platformProjectId: string
  plexonUserId: string
}): Promise<{ ok: true; items: CollectionMemberDto[] } | PlexonTeamFailure> {
  if (!federationReady(input.platformProjectId)) {
    return { ok: false, status: 503, error: 'federation_off' }
  }
  try {
    const response = await fetch(
      collectionUrl(paths.plexonProvisioningCollectionMembersPath(input.platformProjectId)),
      {
        method: 'GET',
        headers: federationHeaders(input.plexonUserId),
        cache: 'no-store',
      },
    )
    const body = (await response.json().catch(() => ({}))) as {
      items?: Array<Record<string, unknown>>
      error?: string
    }
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: typeof body.error === 'string' ? body.error : 'members_list_failed',
      }
    }
    const items: CollectionMemberDto[] = []
    for (const raw of body.items ?? []) {
      const parsed = parseMember(raw)
      if (parsed) items.push(parsed)
    }
    return { ok: true, items }
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : 'members_unreachable',
    }
  }
}

export async function addCollectionMemberOnPlexon(input: {
  platformProjectId: string
  plexonUserId: string
  email: string
  role?: 'admin' | 'member'
}): Promise<
  | { ok: true; status: 'added' | 'already_member'; userId: string; email: string; role: string }
  | PlexonTeamFailure
> {
  if (!federationReady(input.platformProjectId)) {
    return { ok: false, status: 503, error: 'federation_off' }
  }
  try {
    const response = await fetch(
      collectionUrl(paths.plexonProvisioningCollectionMembersPath(input.platformProjectId)),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...federationHeaders(input.plexonUserId),
        },
        body: JSON.stringify({ email: input.email, role: input.role ?? 'member' }),
        cache: 'no-store',
      },
    )
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: typeof body.error === 'string' ? body.error : 'member_add_failed',
      }
    }
    return {
      ok: true,
      status: body.status === 'already_member' ? 'already_member' : 'added',
      userId: String(body.userId ?? ''),
      email: String(body.email ?? input.email),
      role: String(body.role ?? input.role ?? 'member'),
    }
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : 'member_unreachable',
    }
  }
}

export async function revokeCollectionMemberOnPlexon(input: {
  platformProjectId: string
  plexonUserId: string
  memberUserId: string
}): Promise<{ ok: true } | PlexonTeamFailure> {
  if (!federationReady(input.platformProjectId)) {
    return { ok: false, status: 503, error: 'federation_off' }
  }
  try {
    const response = await fetch(
      collectionUrl(
        paths.plexonProvisioningCollectionMemberPath(input.platformProjectId, input.memberUserId),
      ),
      {
        method: 'DELETE',
        headers: federationHeaders(input.plexonUserId),
        cache: 'no-store',
      },
    )
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      return {
        ok: false,
        status: response.status,
        error: typeof body.error === 'string' ? body.error : 'member_revoke_failed',
      }
    }
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : 'member_unreachable',
    }
  }
}

export async function createCollectionInviteOnPlexon(input: {
  platformProjectId: string
  plexonUserId: string
  role?: 'admin' | 'member'
  toEmail?: string
}): Promise<
  | { ok: true; inviteUrl: string; inviteId: string; expiresAt?: string; emailedTo?: string }
  | PlexonTeamFailure
> {
  if (!federationReady(input.platformProjectId)) {
    return { ok: false, status: 503, error: 'federation_off' }
  }
  const payload: Record<string, unknown> = { role: input.role ?? 'member' }
  const toEmail = input.toEmail?.trim()
  if (toEmail) payload.toEmail = toEmail
  try {
    const response = await fetch(
      collectionUrl(paths.plexonProvisioningCollectionInvitesPath(input.platformProjectId)),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...federationHeaders(input.plexonUserId),
        },
        body: JSON.stringify(payload),
        cache: 'no-store',
      },
    )
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: typeof body.error === 'string' ? body.error : 'invite_failed',
      }
    }
    return {
      ok: true,
      inviteUrl: String(body.inviteUrl ?? ''),
      inviteId: String(body.inviteId ?? ''),
      ...(typeof body.expiresAt === 'string' ? { expiresAt: body.expiresAt } : {}),
      ...(typeof body.emailedTo === 'string' ? { emailedTo: body.emailedTo } : {}),
    }
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : 'invite_unreachable',
    }
  }
}
