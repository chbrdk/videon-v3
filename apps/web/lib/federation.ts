import { timingSafeEqual } from 'node:crypto'
import {
  PLEXON_CONTRACT_VERSION_HEADER,
  PLEXON_FEDERATION_CONTRACT_VERSION,
  PLEXON_SERVICE_SECRET_HEADER,
  PLEXON_USER_HEADER,
} from '@videon-v3/contracts'
import { plexonServiceSecret } from './runtime-config'

function sameSecret(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected)
  const actualBytes = Buffer.from(actual)
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes)
}

export type FederationAuthorization =
  | { ok: true }
  | { ok: false; code: 'contract_version_mismatch' | 'service_unauthorized' | 'dependency_unavailable' }

export function authorizeFederationRequest(request: Request): FederationAuthorization {
  const expectedSecret = plexonServiceSecret()
  if (!expectedSecret) return { ok: false, code: 'dependency_unavailable' }

  if (request.headers.get(PLEXON_CONTRACT_VERSION_HEADER)?.trim() !== PLEXON_FEDERATION_CONTRACT_VERSION) {
    return { ok: false, code: 'contract_version_mismatch' }
  }

  const actualSecret = request.headers.get(PLEXON_SERVICE_SECRET_HEADER)?.trim() ?? ''
  if (!actualSecret || !sameSecret(expectedSecret, actualSecret)) {
    return { ok: false, code: 'service_unauthorized' }
  }
  return { ok: true }
}

export function plexonUserId(request: Request): string | null {
  return request.headers.get(PLEXON_USER_HEADER)?.trim() || null
}

export function federationHeaders(): HeadersInit {
  return { [PLEXON_CONTRACT_VERSION_HEADER]: PLEXON_FEDERATION_CONTRACT_VERSION }
}
