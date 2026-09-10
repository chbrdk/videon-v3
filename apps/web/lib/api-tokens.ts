/**
 * API token helpers. Spec: specs/domain/settings-api-tokens.md
 */

import type { ApiTokenStub } from '@videon-v3/contracts'
import {
  createApiToken,
  listApiTokens,
  resolveApiTokenOwner,
  revokeApiToken,
} from './fixtures/api-tokens-store'
import { paths } from './paths'

export type ApiTokensError = { error: string; status: number }
export type ApiTokenCreateResponse = ApiTokenStub & { token: string }

export function toApiTokenOwnerId(sessionUser?: {
  id?: string | null
  email?: string | null
} | null): string {
  const id = sessionUser?.id?.trim()
  if (id) return id
  const email = sessionUser?.email?.trim()
  if (email) return email
  return paths.apiTokenFixtureOwnerId
}

export async function listApiTokensForOwner(ownerId: string): Promise<{ items: ApiTokenStub[] }> {
  return { items: await listApiTokens(ownerId) }
}

export async function createApiTokenForOwner(
  ownerId: string,
  label?: string | null,
): Promise<ApiTokenCreateResponse> {
  const { stub, token } = await createApiToken(ownerId, label)
  return { ...stub, token }
}

export async function revokeApiTokenForOwner(
  tokenId: string,
  ownerId: string,
): Promise<{ ok: true } | ApiTokensError> {
  if (!tokenId.trim()) return { error: 'tokenId is required', status: 400 }
  if (!(await revokeApiToken(tokenId, ownerId))) {
    return { error: 'Token not found or already revoked', status: 404 }
  }
  return { ok: true }
}

export async function verifyApiTokenBearer(
  authorization: string | null | undefined,
): Promise<{ ok: true; ownerId: string; tokenId: string } | ApiTokensError> {
  const resolved = await resolveApiTokenOwner(authorization)
  if (!resolved) return { error: 'Invalid or missing API token', status: 401 }
  return { ok: true, ownerId: resolved.ownerId, tokenId: resolved.tokenId }
}
