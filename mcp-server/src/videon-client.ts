/**
 * HTTP client for videon-v3 Product API.
 * Auth (Plexon assistant): PLEXON_SERVICE_SECRET + X-Plexon-User-Id (per-call actor).
 * Optional: Bearer VIDEON_API_TOKEN for Cursor / direct MCP (Settings token).
 * Spec: specs/domain/mcp-server.md
 */

const BASE_URL = process.env.VIDEON_API_URL ?? ''
const TOKEN = process.env.VIDEON_API_TOKEN?.trim() ?? ''
const CONTRACT =
  process.env.PLEXON_FEDERATION_CONTRACT_VERSION?.trim() ||
  '2026-05-plexon-federation-v3'

function serviceSecret(): string {
  return process.env.PLEXON_SERVICE_SECRET?.trim() || ''
}

export const PLEXON_USER_ID_HEADER = 'X-Plexon-User-Id'
export const PLEXON_SERVICE_SECRET_HEADER = 'X-Service-Secret'
export const PLEXON_CONTRACT_VERSION_HEADER = 'X-Plexon-Contract-Version'

export type VideonFetchOptions = {
  /** Acting Plexon user — required for service-secret ACL (Access Model B). */
  actorUserId?: string
}

export interface VideonFetchError {
  error: true
  message: string
  status?: number
}

export type VideonRequestInit = RequestInit & {
  videon?: VideonFetchOptions
}

export async function videonFetch<T = unknown>(
  path: string,
  options: VideonRequestInit = {},
): Promise<T | VideonFetchError> {
  if (!BASE_URL) {
    return { error: true, message: 'VIDEON_API_URL not configured' }
  }
  const { videon, ...fetchOptions } = options
  const actor = videon?.actorUserId?.trim() || ''
  const secret = serviceSecret()
  if (!secret && !TOKEN) {
    return {
      error: true,
      message: 'PLEXON_SERVICE_SECRET or VIDEON_API_TOKEN not configured',
    }
  }
  if (secret && !actor && !TOKEN) {
    return {
      error: true,
      message: 'actorUserId required when using PLEXON_SERVICE_SECRET',
    }
  }

  const url = path.startsWith('http')
    ? path
    : `${BASE_URL.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  }
  if (secret) {
    headers[PLEXON_SERVICE_SECRET_HEADER] = secret
    headers[PLEXON_CONTRACT_VERSION_HEADER] = CONTRACT
    if (actor) headers[PLEXON_USER_ID_HEADER] = actor
  } else if (TOKEN) {
    headers.Authorization = `Bearer ${TOKEN}`
  }

  try {
    const res = await fetch(url, { ...fetchOptions, headers })
    const text = await res.text()
    let data: T
    try {
      data = text ? (JSON.parse(text) as T) : ({} as T)
    } catch {
      return {
        error: true,
        message: res.ok ? text || 'Empty response' : `HTTP ${res.status}: ${text.slice(0, 200)}`,
        status: res.status,
      }
    }
    if (!res.ok) {
      const err = data as { error?: { message?: string }; message?: string }
      return {
        error: true,
        message: err?.error?.message ?? err?.message ?? `HTTP ${res.status}`,
        status: res.status,
      }
    }
    return data
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { error: true, message: `Request failed: ${message}` }
  }
}

export function isVideonError<T>(r: T | VideonFetchError): r is VideonFetchError {
  return typeof r === 'object' && r !== null && 'error' in r && (r as VideonFetchError).error === true
}
