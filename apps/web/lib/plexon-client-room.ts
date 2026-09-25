/**
 * ClientRoom slot publish → Plexon E2.
 * Spec: specs/domain/suite-enterprise-program.md § E2
 * Contract: plexon-v3/knowledge/client-room-slots.md
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

export const CLIENT_ROOM_SLOT_VIDEON_CUT = 'videon_cut' as const

export type PutClientRoomSlotInput = {
  platformProjectId: string
  slotId: string
  productId: string
  subjectRef: string
  title: string
  href?: string | null
  actorUserId?: string | null
  clear?: boolean
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

export function clientRoomSlotApiPath(platformProjectId: string, slotId: string): string {
  return `${plexonApiBase()}/api/platform/provisioning/collections/${encodeURIComponent(platformProjectId.trim())}/client-room/slots/${encodeURIComponent(slotId.trim())}`
}

function federationLive(): boolean {
  return federationMode() === 'live' && isPlexonAuthConfigured()
}

/**
 * Publish or clear a ClientRoom slot. Returns false on skip / room_missing / network error.
 * Never throws.
 */
export async function putClientRoomSlot(input: PutClientRoomSlotInput): Promise<boolean> {
  const platformProjectId = input.platformProjectId?.trim()
  const slotId = input.slotId?.trim()
  const actorUserId = input.actorUserId?.trim()
  if (!platformProjectId || !slotId || !actorUserId) return false
  if (!federationLive()) return false

  const secret = plexonServiceSecret()
  if (!secret) return false

  const body: Record<string, unknown> = { actorUserId }
  if (input.clear) {
    body.clear = true
  } else {
    const productId = input.productId?.trim()
    const subjectRef = input.subjectRef?.trim()
    const title = input.title?.trim()
    if (!productId || !subjectRef || !title) return false
    body.productId = productId
    body.subjectRef = subjectRef
    body.title = title
    const href = input.href?.trim()
    if (href) body.href = href
  }

  try {
    const res = await fetch(clientRoomSlotApiPath(platformProjectId, slotId), {
      method: 'PUT',
      headers: contractHeaders(secret, actorUserId),
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (res.status === 404) {
      // room_missing — optional room; skip quietly
      return false
    }
    return res.ok
  } catch {
    return false
  }
}

export function schedulePutClientRoomSlot(input: PutClientRoomSlotInput): void {
  void putClientRoomSlot(input).catch(() => undefined)
}
