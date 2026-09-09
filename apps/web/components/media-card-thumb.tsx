'use client'

import { mediaStreamPlaybackUrl } from '@/lib/media-playback-url'
import { useClipThumbnail } from '@/lib/use-clip-thumbnail'

/** Shared Mediathek / Cut-Bin poster from stream + client capture. */
export function MediaCardThumb({
  mediaAssetId,
  platformProjectId,
  atMs,
  durationMs,
  ready = true,
  className = 'videon-media-card__thumb',
}: {
  mediaAssetId: string
  platformProjectId: string
  /** Explicit frame time; defaults to mid-point of duration. */
  atMs?: number
  durationMs?: number | null
  ready?: boolean
  className?: string
}) {
  const playbackUrl = ready ? mediaStreamPlaybackUrl(mediaAssetId, platformProjectId) : null
  const seekMs =
    typeof atMs === 'number' && Number.isFinite(atMs)
      ? Math.max(0, Math.floor(atMs))
      : Math.max(0, Math.floor((durationMs ?? 2000) / 2))
  const thumbnail = useClipThumbnail(playbackUrl, seekMs)
  if (!thumbnail) {
    return <div className={`${className} ${className}--empty`} aria-hidden />
  }
  return (
    <div
      className={className}
      style={{ backgroundImage: `url(${thumbnail})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
      aria-hidden
    />
  )
}
