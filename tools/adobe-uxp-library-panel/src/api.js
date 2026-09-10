/**
 * VIDEON Product API client for the Adobe panel.
 * Spec: adobe-uxp-library-panel.md · media-adobe-download.md
 */

import { httpRequest } from './http.js'
import { normalizeProductBaseUrl } from './settings.js'

const STORAGE_KEY = 'videon.adobe.settings'
const LAST_QUERY_KEY = 'videon.adobe.lastQuery'

const DEFAULTS = {
  productBaseUrl: 'https://videon.projects-a.plygrnd.tech',
  apiToken: '',
  defaultPlatformProjectId: '',
  binName: 'VIDEON',
  compName: 'VIDEON',
  aeSequential: true,
  aeGapFrames: 0,
}

export function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(partial) {
  const next = { ...loadSettings(), ...partial }
  if (partial.productBaseUrl != null) {
    const normalized = normalizeProductBaseUrl(partial.productBaseUrl)
    if (normalized.ok) next.productBaseUrl = normalized.value
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export function loadLastQuery() {
  try {
    return localStorage.getItem(LAST_QUERY_KEY) || ''
  } catch {
    return ''
  }
}

export function saveLastQuery(query) {
  try {
    localStorage.setItem(LAST_QUERY_KEY, String(query || ''))
  } catch {
    /* ignore */
  }
}

function authHeaders(token) {
  const headers = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

function base(settings) {
  return String(settings.productBaseUrl || '').replace(/\/$/, '')
}

async function parseError(response) {
  try {
    const body = await response.json()
    const msg = body?.error?.message || body?.message || body?.error
    const code = body?.error?.code
    if (typeof msg === 'string' && code) return `${code}: ${msg}`
    if (typeof msg === 'string') return msg
    return `${response.status} ${response.statusText}`
  } catch {
    return `${response.status} ${response.statusText}`
  }
}

export async function testHealth(settings, signal) {
  const response = await httpRequest(`${base(settings)}/api/health`, {
    headers: authHeaders(settings.apiToken),
    signal,
  })
  return response.ok
}

/**
 * Resolve token → ownerId via Product verify (no separate owner config).
 * @returns {Promise<{ ownerId: string, tokenId: string }>}
 */
export async function verifyApiToken(settings, signal) {
  const response = await httpRequest(`${base(settings)}/api/tokens/verify`, {
    method: 'POST',
    headers: authHeaders(settings.apiToken),
    signal,
  })
  if (!response.ok) throw new Error(await parseError(response))
  const body = await response.json()
  if (!body?.ok || !body?.ownerId) {
    throw new Error('Token verify lieferte keinen ownerId')
  }
  return { ownerId: String(body.ownerId), tokenId: String(body.tokenId || '') }
}

export async function listCollections(settings, signal) {
  const response = await httpRequest(`${base(settings)}/api/collections`, {
    headers: authHeaders(settings.apiToken),
    signal,
  })
  if (!response.ok) throw new Error(await parseError(response))
  return response.json()
}

export async function searchMedia(settings, query, limit = 40, signal) {
  const params = new URLSearchParams({
    q: query,
    limit: String(Math.min(Math.max(limit, 1), 40)),
  })
  if (settings.defaultPlatformProjectId) {
    params.set('platformProjectId', settings.defaultPlatformProjectId)
  }
  const response = await httpRequest(`${base(settings)}/api/media/search?${params}`, {
    headers: authHeaders(settings.apiToken),
    signal,
  })
  if (!response.ok) throw new Error(await parseError(response))
  return response.json()
}

export function frameUrl(settings, hit, width = 240) {
  const t = hit.startMs != null && hit.startMs >= 0 ? Math.floor(hit.startMs) : 1000
  const params = new URLSearchParams({
    platformProjectId: hit.platformProjectId,
    t: String(t),
    w: String(width),
  })
  return `${base(settings)}/api/media/${encodeURIComponent(hit.mediaAssetId)}/frame?${params}`
}

export async function fetchFrameBlob(settings, hit, signal) {
  const response = await httpRequest(frameUrl(settings, hit), {
    headers: authHeaders(settings.apiToken),
    signal,
    responseType: 'arraybuffer',
  })
  if (!response.ok) return null
  return response.blob()
}

export async function requestAdobeDownload(settings, hit, signal) {
  if (!hit.platformProjectId) {
    throw new Error('platformProjectId is required for download')
  }
  const params = new URLSearchParams({
    platformProjectId: hit.platformProjectId,
    kind: 'source',
    mode: 'json',
  })
  const response = await httpRequest(
    `${base(settings)}/api/media/${encodeURIComponent(hit.mediaAssetId)}/adobe-download?${params}`,
    { headers: authHeaders(settings.apiToken), signal },
  )
  if (!response.ok) throw new Error(await parseError(response))
  return response.json()
}

export function absoluteProductHref(settings, href) {
  if (!href) return null
  if (/^https?:\/\//i.test(href)) return href
  return `${base(settings)}${href.startsWith('/') ? '' : '/'}${href}`
}
