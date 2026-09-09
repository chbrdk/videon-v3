'use client'

import { useInViewOnce } from '@/lib/use-in-view'
import { FRAME_WIDTH_DEFAULT, mediaFramePosterUrl } from '@/lib/media-frame-poster'

/** True once in view — exposes the Frame URL for browser-native loading. */
export function useFramePoster(frameUrl: string | null): {
  src: string | null
  status: 'idle' | 'ready'
} {
  return {
    src: frameUrl,
    status: frameUrl ? 'ready' : 'idle',
  }
}

/** Lazy Frame URL gated by IntersectionObserver. */
export function useLazyFramePosterUrl(
  buildUrl: () => string | null,
  options?: { enabled?: boolean; rootMargin?: string },
): { ref: ReturnType<typeof useInViewOnce<HTMLDivElement>>[0]; src: string | null } {
  const [ref, inView] = useInViewOnce<HTMLDivElement>({
    enabled: options?.enabled !== false,
    rootMargin: options?.rootMargin ?? '120px 0px',
  })
  const src = inView ? buildUrl() : null
  return { ref, src }
}

export function framePosterUrl(
  mediaAssetId: string,
  platformProjectId: string,
  atMs: number,
  maxWidth = FRAME_WIDTH_DEFAULT,
): string {
  return mediaFramePosterUrl(mediaAssetId, platformProjectId, atMs, maxWidth)
}
