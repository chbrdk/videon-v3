/**
 * HTTP client for videon-v3 Product API.
 * Auth: Bearer VIDEON_API_TOKEN (Settings API token — Access Model B owner).
 */

const BASE_URL = process.env.VIDEON_API_URL ?? ''
const TOKEN = process.env.VIDEON_API_TOKEN ?? ''

export interface VideonFetchError {
  error: true
  message: string
  status?: number
}

export async function videonFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T | VideonFetchError> {
  if (!BASE_URL) {
    return { error: true, message: 'VIDEON_API_URL not configured' }
  }
  if (!TOKEN) {
    return { error: true, message: 'VIDEON_API_TOKEN not configured' }
  }
  const url = path.startsWith('http')
    ? path
    : `${BASE_URL.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${TOKEN}`,
    ...(options.headers as Record<string, string>),
  }
  try {
    const res = await fetch(url, { ...options, headers })
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
