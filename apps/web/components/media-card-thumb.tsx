'use client'

import { useInViewOnce } from '@/lib/use-in-view'
import { mediaFramePosterAtDuration } from '@/lib/media-frame-poster'
import { useFramePoster } from '@/lib/use-frame-poster'

/** Shared Mediathek / Cut-Bin poster via Frame API (lazy when in view). */
export function MediaCardThumb({
  mediaAssetId,
  platformProjectId,
  atMs,
  durationMs,
  ready = true,
  lazy = true,
  className = 'videon-media-card__thumb',
}: {
  mediaAssetId: string
  platformProjectId: string
  /** Explicit frame time; defaults to mid-point of duration. */
  atMs?: number
  durationMs?: number | null
  ready?: boolean
  /** When true, fetch poster only after the card intersects the viewport. */
  lazy?: boolean
  className?: string
}) {
  const [ref, inView] = useInViewOnce<HTMLDivElement>({
    enabled: ready && lazy,
    rootMargin: '160px 0px',
  })
  const shouldLoad = ready && (!lazy || inView)
  const frameUrl = shouldLoad
    ? mediaFramePosterAtDuration(mediaAssetId, platformProjectId, durationMs, atMs)
    : null
  const posterUrl = useFramePoster(frameUrl)

  if (!posterUrl) {
    return <div ref={ref} className={`${className} ${className}--empty`} aria-hidden />
  }
  return (
    <div
      ref={ref}
      className={className}
      style={{ backgroundImage: `url(${posterUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
      aria-hidden
    />
  )
}
