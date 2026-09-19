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

const MAX_PAGES = 40

function federationHeaders(plexonUserId: string): HeadersInit {
  return {
    [PLEXON_CONTRACT_VERSION_HEADER]: PLEXON_FEDERATION_CONTRACT_VERSION,
    [PLEXON_SERVICE_SECRET_HEADER]: plexonServiceSecret(),
    [PLEXON_USER_HEADER]: plexonUserId,
  }
}

function parseCollection(item: Record<string, unknown>): AccessibleCollection | null {
  if (typeof item.id !== 'string' || !item.id.trim()) return null
  if (typeof item.name !== 'string' || !item.name.trim()) return null
  if (typeof item.companyId !== 'string' || !item.companyId.trim()) return null
  return {
    id: item.id.trim(),
    name: item.name.trim(),
    status: typeof item.status === 'string' ? item.status : 'active',
    companyId: item.companyId.trim(),
    domain: typeof item.domain === 'string' ? item.domain : null,
  }
}

/** Access Model B directory from PLEXON. Pages `nextCursor`. Null when federation is unavailable. */
export async function fetchAccessibleCollections(
  plexonUserId: string,
): Promise<AccessibleCollectionsResult | null> {
  if (federationMode() !== 'live' || !isLiveFederationConfigured()) return null
  const base = plexonBaseUrl().replace(/\/$/, '')
  const items: AccessibleCollection[] = []
  let cursor: string | null = null
  let pages = 0
  let totalAccessible = 0
  let truncated = false

  try {
    do {
      pages += 1
      const url = new URL(`${base}${paths.plexonAccessibleCollectionsPath}`)
      url.searchParams.set('limit', '100')
      if (cursor) url.searchParams.set('cursor', cursor)

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: federationHeaders(plexonUserId),
        cache: 'no-store',
      })
      if (!response.ok) return null
      const body = (await response.json()) as {
        items?: Array<Record<string, unknown>>
        totalAccessible?: number
        truncated?: boolean
        nextCursor?: string | null
      }
      for (const raw of body.items ?? []) {
        const parsed = parseCollection(raw)
        if (parsed) items.push(parsed)
      }
      totalAccessible =
        typeof body.totalAccessible === 'number' ? body.totalAccessible : items.length
      const next = body.nextCursor?.trim() || null
      if (body.truncated && next) {
        cursor = next
      } else {
        cursor = null
        truncated = Boolean(body.truncated && !next)
      }
      if (pages >= MAX_PAGES && cursor) {
        truncated = true
        break
      }
    } while (cursor)

    return { items, totalAccessible, truncated }
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
