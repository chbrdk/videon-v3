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
