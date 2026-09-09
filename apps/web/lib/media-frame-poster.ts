import { paths } from '@/lib/paths'

/** Bucket seek times so Frame API + browser cache reuse posters. */
export function mediaFrameSeekMs(atMs: number): number {
  if (!Number.isFinite(atMs) || atMs < 0) return 1000
  return Math.round(atMs / 250) * 250
}

/**
 * Same-origin Frame JPEG URL for Bin / timeline posters.
 * Spec: specs/api/media-frame.md · cut-editor-load-performance.md
 */
export function mediaFramePosterUrl(
  mediaAssetId: string,
  platformProjectId: string,
  atMs: number,
): string {
  return paths.routes.apiMediaFrame(mediaAssetId, platformProjectId, mediaFrameSeekMs(atMs))
}

export function mediaFramePosterAtDuration(
  mediaAssetId: string,
  platformProjectId: string,
  durationMs: number | null | undefined,
  atMs?: number,
): string {
  const seek =
    typeof atMs === 'number' && Number.isFinite(atMs)
      ? Math.max(0, atMs)
      : Math.max(0, Math.floor((durationMs ?? 2000) / 2))
  return mediaFramePosterUrl(mediaAssetId, platformProjectId, seek)
}

const MAX_CONCURRENT_FRAMES = 4
let activeFrameLoads = 0
const frameWaiters: Array<() => void> = []

function releaseFrameSlot() {
  activeFrameLoads = Math.max(0, activeFrameLoads - 1)
  const next = frameWaiters.shift()
  if (next) next()
}

/** Cap concurrent Frame API fetches (Bin / timeline / search posters). */
export async function withFrameRequestSlot<T>(run: () => Promise<T>): Promise<T> {
  await new Promise<void>((resolve) => {
    const tryAcquire = () => {
      if (activeFrameLoads < MAX_CONCURRENT_FRAMES) {
        activeFrameLoads += 1
        resolve()
        return
      }
      frameWaiters.push(tryAcquire)
    }
    tryAcquire()
  })
  try {
    return await run()
  } finally {
    releaseFrameSlot()
  }
}

const frameBlobCache = new Map<string, string>()

/**
 * Fetch a Frame JPEG through the concurrency gate and return a blob:/cached URL.
 * Callers that unmount before resolve should ignore the result (hook handles revoke).
 */
export async function loadFramePosterBlobUrl(frameUrl: string): Promise<string> {
  const cached = frameBlobCache.get(frameUrl)
  if (cached) return cached
  return withFrameRequestSlot(async () => {
    const hit = frameBlobCache.get(frameUrl)
    if (hit) return hit
    const response = await fetch(frameUrl)
    if (!response.ok) throw new Error(`Frame ${response.status}`)
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    frameBlobCache.set(frameUrl, objectUrl)
    return objectUrl
  })
}
