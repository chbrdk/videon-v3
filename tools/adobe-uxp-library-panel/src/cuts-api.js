/**
 * Cuts Product API — adobe-uxp-open-cut-premiere.md Wave B.
 */

import { httpRequest } from './http.js'
import { normalizeCutsList } from './open-cut-model.js'

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

export async function listCuts(settings, platformProjectId, signal) {
  if (!platformProjectId) throw new Error('platformProjectId is required')
  const params = new URLSearchParams({ platformProjectId })
  const response = await httpRequest(`${base(settings)}/api/cuts?${params}`, {
    headers: authHeaders(settings.apiToken),
    signal,
  })
  if (!response.ok) throw new Error(await parseError(response))
  return normalizeCutsList(await response.json())
}

export async function listCutExports(settings, cutId, platformProjectId, signal) {
  const params = new URLSearchParams({ platformProjectId })
  const response = await httpRequest(
    `${base(settings)}/api/cuts/${encodeURIComponent(cutId)}/exports?${params}`,
    { headers: authHeaders(settings.apiToken), signal },
  )
  if (!response.ok) throw new Error(await parseError(response))
  const body = await response.json()
  return Array.isArray(body?.exports) ? body.exports : []
}

export async function enqueuePremiereExport(settings, cutId, platformProjectId, idempotencyKey, signal) {
  const params = new URLSearchParams({ platformProjectId })
  const response = await httpRequest(
    `${base(settings)}/api/cuts/${encodeURIComponent(cutId)}/exports?${params}`,
    {
      method: 'POST',
      headers: {
        ...authHeaders(settings.apiToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        format: 'premiere_xml',
        idempotencyKey: idempotencyKey || undefined,
      }),
      signal,
    },
  )
  if (!response.ok) throw new Error(await parseError(response))
  const body = await response.json()
  if (!body?.export?.id) throw new Error('Export enqueue ohne export.id')
  return body.export
}

export async function getCutExport(settings, cutId, exportId, platformProjectId, signal) {
  const params = new URLSearchParams({ platformProjectId })
  const response = await httpRequest(
    `${base(settings)}/api/cuts/${encodeURIComponent(cutId)}/exports/${encodeURIComponent(exportId)}?${params}`,
    { headers: authHeaders(settings.apiToken), signal },
  )
  if (!response.ok) throw new Error(await parseError(response))
  return response.json()
}

/** Download ZIP bytes from signed downloadUrl (no Bearer on signed URL). */
export async function downloadExportZip(downloadUrl, signal) {
  if (!downloadUrl) throw new Error('downloadUrl fehlt')
  const response = await httpRequest(downloadUrl, {
    signal,
    responseType: 'arraybuffer',
  })
  if (!response.ok) {
    let detail = ''
    try {
      const text = await response.text()
      detail = text ? ` ${text.slice(0, 180)}` : ''
    } catch {
      /* ignore */
    }
    throw new Error(`ZIP download ${response.status}${detail}`.trim())
  }
  const buffer = await response.arrayBuffer()
  if (!buffer?.byteLength) throw new Error('ZIP leer')
  // MinIO/S3 sometimes returns 200 XML error bodies for missing keys on misconfigured gateways.
  const head = new Uint8Array(buffer.slice(0, Math.min(64, buffer.byteLength)))
  const ascii = String.fromCharCode(...head)
  if (/NoSuchKey|specified key does not exist/i.test(ascii)) {
    throw new Error('The specified key does not exist')
  }
  return buffer
}

export async function getCutDetail(settings, cutId, platformProjectId, signal) {
  const params = new URLSearchParams({ platformProjectId })
  const response = await httpRequest(
    `${base(settings)}/api/cuts/${encodeURIComponent(cutId)}?${params}`,
    { headers: authHeaders(settings.apiToken), signal },
  )
  if (!response.ok) throw new Error(await parseError(response))
  return response.json()
}

export async function listWorkspaceMedia(settings, platformProjectId, signal) {
  const params = new URLSearchParams({ platformProjectId })
  const response = await httpRequest(`${base(settings)}/api/media?${params}`, {
    headers: authHeaders(settings.apiToken),
    signal,
  })
  if (!response.ok) throw new Error(await parseError(response))
  const body = await response.json()
  return Array.isArray(body?.items) ? body.items : Array.isArray(body) ? body : []
}

/** PATCH restore — replace V1 timeline (optional videoClips/audioClips omitted = leave lanes). */
export async function restoreCutFromPushback(settings, cutId, platformProjectId, scenes, signal) {
  const params = new URLSearchParams({ platformProjectId })
  const response = await httpRequest(
    `${base(settings)}/api/cuts/${encodeURIComponent(cutId)}?${params}`,
    {
      method: 'PATCH',
      headers: {
        ...authHeaders(settings.apiToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'restore', scenes }),
      signal,
    },
  )
  if (!response.ok) throw new Error(await parseError(response))
  return response.json()
}
