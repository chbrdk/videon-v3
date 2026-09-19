/**
 * Gate for the Collection team BFF. Uses the accessible-collections directory (the same
 * authoritative check `resolveAccessibleWorkspace` performs first) so the team surface never
 * touches `videon_workspaces` / `videon_workspace_members`: PLEXON is SSOT, the local members
 * table stays a read projection. Spec: `specs/domain/project-team.md`.
 */

import type { ApiErrorCode } from '@videon-v3/contracts'
import { apiError } from './api-response'
import { fetchAccessibleCollections, type AccessibleCollection } from './plexon-collections'
import { isRealPlatformProjectId } from './plexon-platform-id'
import { requireSessionUserId } from './session-user'

export type CollectionTeamDenial = {
  status: number
  code: ApiErrorCode
  message: string
  retryable: boolean
}

export type CollectionTeamAccess =
  | {
      ok: true
      plexonUserId: string
      platformProjectId: string
      collection: AccessibleCollection
    }
  | { ok: false; denial: CollectionTeamDenial }

export async function authorizeCollectionTeamRequest(
  rawPlatformProjectId: string,
): Promise<CollectionTeamAccess> {
  const plexonUserId = await requireSessionUserId()
  if (!plexonUserId) {
    return {
      ok: false,
      denial: {
        status: 401,
        code: 'service_unauthorized',
        message: 'Authentication required',
        retryable: false,
      },
    }
  }

  const platformProjectId = rawPlatformProjectId.trim()
  if (!isRealPlatformProjectId(platformProjectId)) {
    return {
      ok: false,
      denial: {
        status: 400,
        code: 'invalid_payload',
        message: 'platformProjectId must be a PLEXON Collection id',
        retryable: false,
      },
    }
  }

  const directory = await fetchAccessibleCollections(plexonUserId)
  if (!directory) {
    return {
      ok: false,
      denial: {
        status: 503,
        code: 'dependency_unavailable',
        message: 'PLEXON Collection directory is unavailable',
        retryable: true,
      },
    }
  }

  const collection = directory.items.find((item) => item.id === platformProjectId) ?? null
  if (!collection) {
    return {
      ok: false,
      denial: {
        status: 403,
        code: 'collection_access_denied',
        message: 'Collection is not accessible for this user',
        retryable: false,
      },
    }
  }

  return { ok: true, plexonUserId, platformProjectId, collection }
}

export function denialResponse(request: Request, denial: CollectionTeamDenial) {
  return apiError(request, denial.status, denial.code, denial.message, {
    retryable: denial.retryable,
  })
}

/** Translate a PLEXON team-API failure into the VIDEON ApiError envelope. */
export function upstreamTeamError(
  request: Request,
  upstream: { status: number; error: string },
) {
  if (upstream.status === 401 || upstream.status === 403) {
    return apiError(request, 403, 'collection_access_denied', upstream.error)
  }
  if (upstream.status === 404) {
    return apiError(request, 404, 'not_found', upstream.error)
  }
  if (upstream.status === 400 || upstream.status === 409 || upstream.status === 422) {
    return apiError(request, 400, 'invalid_payload', upstream.error)
  }
  return apiError(request, 503, 'dependency_unavailable', upstream.error, { retryable: true })
}
