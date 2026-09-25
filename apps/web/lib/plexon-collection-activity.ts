/**
 * Collection activity distillate (E1) → Plexon provisioning.
 * Spec: specs/domain/suite-enterprise-program.md § E1
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

export type PostCollectionActivityInput = {
  platformProjectId: string
  productId: string
  kind: string
  status: string
  subjectRef: string
  title: string
  href?: string | null
  at?: string | null
  actorUserId?: string | null
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

export function collectionActivityApiPath(platformProjectId: string): string {
  return `${plexonApiBase()}/api/platform/provisioning/collections/${encodeURIComponent(platformProjectId.trim())}/activity`
}

function federationLive(): boolean {
  return federationMode() === 'live' && isPlexonAuthConfigured()
}

export async function postCollectionActivityDistillate(
  input: PostCollectionActivityInput,
): Promise<boolean> {
  const platformProjectId = input.platformProjectId?.trim()
  const productId = input.productId?.trim()
  const subjectRef = input.subjectRef?.trim()
  const title = input.title?.trim()
  if (!platformProjectId || !productId || !subjectRef || !title) return false
  if (!federationLive()) return false

  const secret = plexonServiceSecret()
  if (!secret) return false

  const body: Record<string, unknown> = {
    productId,
    kind: input.kind.trim(),
    status: input.status.trim(),
    subjectRef,
    title,
  }
  const href = input.href?.trim()
  if (href) body.href = href
  const at = input.at?.trim()
  if (at) body.at = at
  const actorUserId = input.actorUserId?.trim()
  if (actorUserId) body.actorUserId = actorUserId

  try {
    const res = await fetch(collectionActivityApiPath(platformProjectId), {
      method: 'POST',
      headers: contractHeaders(secret, actorUserId),
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    return res.ok
  } catch {
    return false
  }
}

export function scheduleCollectionActivityDistillate(input: PostCollectionActivityInput): void {
  void postCollectionActivityDistillate(input).catch(() => undefined)
}
