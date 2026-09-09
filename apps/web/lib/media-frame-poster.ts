import { paths } from '@/lib/paths'
import {
  FRAME_WIDTH_BIN,
  FRAME_WIDTH_DEFAULT,
  FRAME_WIDTH_TIMELINE,
  mediaFrameSeekMs,
  snapFrameWidth,
} from '@/lib/frame-poster-tiers'

export {
  FRAME_WIDTH_BIN,
  FRAME_WIDTH_DEFAULT,
  FRAME_WIDTH_TIMELINE,
  mediaFrameSeekMs,
  snapFrameWidth,
}

/**
 * Same-origin Frame JPEG URL for Bin / timeline posters.
 * Spec: specs/api/media-frame.md · cut-editor-load-performance.md
 * Browser loads this URL directly (HTTP cache) — no fetch→blob on the hot path.
 */
export function mediaFramePosterUrl(
  mediaAssetId: string,
  platformProjectId: string,
  atMs: number,
  maxWidth: number = FRAME_WIDTH_DEFAULT,
): string {
  return paths.routes.apiMediaFrame(
    mediaAssetId,
    platformProjectId,
    mediaFrameSeekMs(atMs),
    snapFrameWidth(maxWidth),
  )
}

export function mediaFramePosterAtDuration(
  mediaAssetId: string,
  platformProjectId: string,
  durationMs: number | null | undefined,
  atMs?: number,
  maxWidth: number = FRAME_WIDTH_BIN,
): string {
  const seek =
    typeof atMs === 'number' && Number.isFinite(atMs)
      ? Math.max(0, atMs)
      : Math.max(0, Math.floor((durationMs ?? 2000) / 2))
  return mediaFramePosterUrl(mediaAssetId, platformProjectId, seek, maxWidth)
}
