'use client'

import { useState } from 'react'
import { useClipThumbnail } from '@/lib/use-clip-thumbnail'
import { useInViewOnce } from '@/lib/use-in-view'
import { FRAME_WIDTH_TIMELINE, mediaFramePosterUrl } from '@/lib/media-frame-poster'
import { mediaStreamPlaybackUrl } from '@/lib/media-playback-url'

/**
 * Timeline / filmstrip poster.
 * Prefer Frame API URL (browser cache); fall back to client capture on error / missing ids.
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
  playbackUrl?: string | null
  lazy?: boolean
}) {
  const [ref, inView] = useInViewOnce<HTMLDivElement>({
    enabled: lazy,
    rootMargin: '80px 0px',
  })
  const [frameFailed, setFrameFailed] = useState(false)
  const shouldLoad = !lazy || inView
  const useFrame = Boolean(mediaAssetId && platformProjectId)
  const frameApiUrl =
    shouldLoad && useFrame && mediaAssetId && platformProjectId
      ? mediaFramePosterUrl(mediaAssetId, platformProjectId, sourceMs, FRAME_WIDTH_TIMELINE)
      : null
  const streamFallback =
    useFrame && mediaAssetId && platformProjectId
      ? mediaStreamPlaybackUrl(mediaAssetId, platformProjectId)
      : playbackUrl
  const clientThumb = useClipThumbnail(
    shouldLoad && (!useFrame || frameFailed) ? streamFallback : null,
    sourceMs,
  )
  const thumbnail = frameFailed || !useFrame ? clientThumb : frameApiUrl

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
    <div ref={ref} className="videon-cut-timeline__clip-thumb" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- same-origin Frame API */}
      <img
        src={thumbnail}
        alt=""
        loading="lazy"
        decoding="async"
        className="videon-cut-timeline__clip-thumb-img"
        onError={() => {
          if (useFrame && !frameFailed) setFrameFailed(true)
        }}
      />
    </div>
  )
}
