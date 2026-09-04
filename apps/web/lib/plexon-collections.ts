import {
  PLEXON_CONTRACT_VERSION_HEADER,
  PLEXON_FEDERATION_CONTRACT_VERSION,
  PLEXON_SERVICE_SECRET_HEADER,
  PLEXON_USER_HEADER,
} from '@videon-v3/contracts'
import { paths } from './paths'
import {
  federationMode,
  isLiveFederationConfigured,
  plexonBaseUrl,
  plexonServiceSecret,
} from './runtime-config'

export type AccessibleCollection = {
  id: string
  name: string
  status: string
  companyId: string
  domain: string | null
}

export type AccessibleCollectionsResult = {
  items: AccessibleCollection[]
  totalAccessible: number
  truncated: boolean
}

function federationHeaders(plexonUserId: string): HeadersInit {
  return {
    [PLEXON_CONTRACT_VERSION_HEADER]: PLEXON_FEDERATION_CONTRACT_VERSION,
    [PLEXON_SERVICE_SECRET_HEADER]: plexonServiceSecret(),
    [PLEXON_USER_HEADER]: plexonUserId,
  }
}

/** Access Model B directory from PLEXON. Null when federation is unavailable. */
export async function fetchAccessibleCollections(
  plexonUserId: string,
): Promise<AccessibleCollectionsResult | null> {
  if (federationMode() !== 'live' || !isLiveFederationConfigured()) return null
  const url = `${plexonBaseUrl()}${paths.plexonAccessibleCollectionsPath}`
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: federationHeaders(plexonUserId),
      cache: 'no-store',
    })
    if (!response.ok) return null
    const body = (await response.json()) as {
      items?: Array<Record<string, unknown>>
      totalAccessible?: number
      truncated?: boolean
    }
    const items: AccessibleCollection[] = []
    for (const item of body.items ?? []) {
      if (typeof item.id !== 'string' || !item.id.trim()) continue
      if (typeof item.name !== 'string' || !item.name.trim()) continue
      if (typeof item.companyId !== 'string' || !item.companyId.trim()) continue
      items.push({
        id: item.id.trim(),
        name: item.name.trim(),
        status: typeof item.status === 'string' ? item.status : 'active',
        companyId: item.companyId.trim(),
        domain: typeof item.domain === 'string' ? item.domain : null,
      })
    }
    return {
      items,
      totalAccessible: typeof body.totalAccessible === 'number' ? body.totalAccessible : items.length,
      truncated: Boolean(body.truncated),
    }
  } catch {
    return null
  }
}

/** Ask PLEXON to upsert the VIDEON mirror for one Collection. */
export async function requestVideonMirrorSync(
  plexonUserId: string,
  platformProjectId: string,
): Promise<boolean> {
  if (federationMode() !== 'live' || !isLiveFederationConfigured()) return false
  const url = `${plexonBaseUrl()}${paths.plexonProjectSyncPath(platformProjectId)}`
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...federationHeaders(plexonUserId),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ productIds: ['videon'] }),
      cache: 'no-store',
    })
    return response.ok
  } catch {
    return false
  }
}
