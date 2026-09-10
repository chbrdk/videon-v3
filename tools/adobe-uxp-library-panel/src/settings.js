/** Settings helpers — pure validation / defaults. */

export function normalizeProductBaseUrl(value) {
  const trimmed = String(value || '').trim().replace(/\/$/, '')
  if (!trimmed) return { ok: false, error: 'Product Base URL fehlt' }
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false, error: 'URL muss http(s) sein' }
    }
    return { ok: true, value: `${url.origin}${url.pathname}`.replace(/\/$/, '') }
  } catch {
    return { ok: false, error: 'Ungültige Product Base URL' }
  }
}

export function looksLikeApiToken(token) {
  const t = String(token || '').trim()
  return t.startsWith('videon_') && t.length > 20
}
