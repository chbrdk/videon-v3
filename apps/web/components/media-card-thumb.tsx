'use client'

import { useInViewOnce } from '@/lib/use-in-view'
import { FRAME_WIDTH_BIN, mediaFramePosterAtDuration } from '@/lib/media-frame-poster'
import { mediaStreamPlaybackUrl } from '@/lib/media-playback-url'
import { useClipThumbnail } from '@/lib/use-clip-thumbnail'
import { useState } from 'react'

/** Shared Mediathek / Cut-Bin poster via Frame API (lazy when in view, browser-cached URL). */
export function MediaCardThumb({
  mediaAssetId,
  platformProjectId,
  atMs,
  durationMs,
  ready = true,
  lazy = true,
  className = 'videon-media-card__thumb',
  allowClientFallback = true,
}: {
  mediaAssetId: string
  platformProjectId: string
  atMs?: number
  durationMs?: number | null
  ready?: boolean
  lazy?: boolean
  className?: string
  allowClientFallback?: boolean
}) {
  const [ref, inView] = useInViewOnce<HTMLDivElement>({
    enabled: ready && lazy,
    rootMargin: '160px 0px',
  })
  const [frameFailed, setFrameFailed] = useState(false)
  const shouldLoad = ready && (!lazy || inView)
  const seekMs =
    typeof atMs === 'number' && Number.isFinite(atMs)
      ? Math.max(0, atMs)
      : Math.max(0, Math.floor((durationMs ?? 2000) / 2))
  const frameUrl = shouldLoad
    ? mediaFramePosterAtDuration(mediaAssetId, platformProjectId, durationMs, atMs, FRAME_WIDTH_BIN)
    : null
  const fallbackUrl =
    shouldLoad && allowClientFallback && frameFailed
      ? mediaStreamPlaybackUrl(mediaAssetId, platformProjectId)
      : null
  const clientThumb = useClipThumbnail(fallbackUrl, seekMs)
  const posterUrl = frameFailed ? clientThumb : frameUrl

  if (!posterUrl) {
    return <div ref={ref} className={`${className} ${className}--empty`} aria-hidden />
  }
  return (
    <div ref={ref} className={className} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element -- same-origin Frame API; browser HTTP cache */}
      <img
        src={posterUrl}
        alt=""
        loading="lazy"
        decoding="async"
        className={`${className}-img`}
        onError={() => {
          if (!frameFailed) setFrameFailed(true)
        }}
      />
    </div>
  )
}
