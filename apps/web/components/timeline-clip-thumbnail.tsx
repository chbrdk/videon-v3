'use client'

import { useClipThumbnail } from '@/lib/use-clip-thumbnail'
import { useInViewOnce } from '@/lib/use-in-view'
import { mediaFramePosterUrl } from '@/lib/media-frame-poster'
import { useFramePoster } from '@/lib/use-frame-poster'

/**
 * Timeline / filmstrip poster.
 * Prefer Frame API when media ids are known; fall back to client capture from stream URL.
 */
export function TimelineClipThumbnail({
  sourceMs,
  mediaAssetId,
  platformProjectId,
  playbackUrl = null,
  lazy = true,
}: {
  sourceMs: number
  mediaAssetId?: string
  platformProjectId?: string
  /** Legacy fallback when Frame API ids are unavailable (Media editor filmstrip). */
  playbackUrl?: string | null
  lazy?: boolean
}) {
  const [ref, inView] = useInViewOnce<HTMLDivElement>({
    enabled: lazy,
    rootMargin: '80px 0px',
  })
  const shouldLoad = !lazy || inView
  const useFrame = Boolean(mediaAssetId && platformProjectId)
  const frameApiUrl =
    shouldLoad && useFrame && mediaAssetId && platformProjectId
      ? mediaFramePosterUrl(mediaAssetId, platformProjectId, sourceMs)
      : null
  const frameBlobUrl = useFramePoster(frameApiUrl)
  const clientThumb = useClipThumbnail(
    shouldLoad && !useFrame ? playbackUrl : null,
    sourceMs,
  )
  const thumbnail = frameBlobUrl ?? clientThumb

  if (!thumbnail) {
    return (
      <div
        ref={ref}
        className="videon-cut-timeline__clip-thumb videon-cut-timeline__clip-thumb--empty"
        aria-hidden="true"
      />
    )
  }
  return (
    <div
      ref={ref}
      className="videon-cut-timeline__clip-thumb"
      style={{ backgroundImage: `url(${thumbnail})` }}
      aria-hidden="true"
    />
  )
}
