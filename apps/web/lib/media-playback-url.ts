import { paths } from '@/lib/paths'

/**
 * Prefer same-origin relative stream paths. Absolute URLs built from the
 * container-local request origin (e.g. http://localhost:3010) break in the browser.
 */
export function mediaStreamPlaybackUrl(mediaAssetId: string, platformProjectId: string): string {
  return paths.routes.apiMediaStream(mediaAssetId, platformProjectId)
}

export function normalizeMediaPlaybackUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const trimmed = url.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('/')) return trimmed
  try {
    const parsed = new URL(trimmed)
    if (parsed.pathname.includes('/api/media/') && parsed.pathname.endsWith('/stream')) {
      return `${parsed.pathname}${parsed.search}`
    }
    return trimmed
  } catch {
    return trimmed
  }
}
