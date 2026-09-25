/**
 * Suite audit ingest → Plexon E4.
 * Spec: specs/domain/suite-enterprise-program.md § E4
 */

import {
  PLEXON_CONTRACT_VERSION_HEADER,
  PLEXON_FEDERATION_CONTRACT_VERSION,
  PLEXON_SERVICE_SECRET_HEADER,
} from '@videon-v3/contracts'
import {
  federationMode,
  isPlexonAuthConfigured,
  plexonAuthUrl,
  plexonBaseUrl,
  plexonServiceSecret,
} from '@/lib/runtime-config'

export const SUITE_AUDIT_ACTIONS = [
  'run_started',
  'run_finished',
  'published',
  'approved',
  'revoked',
  'exported',
] as const

export type SuiteAuditAction = (typeof SUITE_AUDIT_ACTIONS)[number]

export type PostSuiteAuditInput = {
  platformProjectId: string
  productId: string
  action: SuiteAuditAction
  actorUserId?: string | null
  subjectRef?: string | null
  modelRef?: string | null
  meta?: Record<string, unknown>
}

function plexonApiBase(): string {
  const auth = plexonAuthUrl().replace(/\/$/, '')
  if (auth) return auth
  return plexonBaseUrl().replace(/\/$/, '')
}

function contractHeaders(secret: string, actorUserId?: string | null): Record<string, string> {
  const actor = actorUserId?.trim()
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${secret}`,
    [PLEXON_CONTRACT_VERSION_HEADER]: PLEXON_FEDERATION_CONTRACT_VERSION,
    [PLEXON_SERVICE_SECRET_HEADER]: secret,
    ...(actor ? { 'X-Plexon-User-Id': actor } : {}),
  }
}

export function suiteAuditApiPath(platformProjectId: string): string {
  return `${plexonApiBase()}/api/platform/provisioning/collections/${encodeURIComponent(platformProjectId.trim())}/audit`
}

function federationLive(): boolean {
  return federationMode() === 'live' && isPlexonAuthConfigured()
}

export async function postSuiteAuditEvent(input: PostSuiteAuditInput): Promise<boolean> {
  const platformProjectId = input.platformProjectId?.trim()
  const productId = input.productId?.trim()
  const actorUserId = input.actorUserId?.trim()
  if (!platformProjectId || !productId || !actorUserId) return false
  if (!federationLive()) return false

  const secret = plexonServiceSecret()
  if (!secret) return false

  try {
    const res = await fetch(suiteAuditApiPath(platformProjectId), {
      method: 'POST',
      headers: contractHeaders(secret, actorUserId),
      body: JSON.stringify({
        actorUserId,
        productId,
        action: input.action,
        ...(input.subjectRef?.trim() ? { subjectRef: input.subjectRef.trim() } : {}),
        ...(input.modelRef?.trim() ? { modelRef: input.modelRef.trim() } : {}),
        ...(input.meta ? { meta: input.meta } : {}),
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    return res.ok
  } catch {
    return false
  }
}

export function scheduleSuiteAuditEvent(input: PostSuiteAuditInput): void {
  void postSuiteAuditEvent(input).catch(() => undefined)
}
