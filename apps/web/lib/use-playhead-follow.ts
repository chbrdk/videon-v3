'use client'

import { useEffect, type RefObject } from 'react'

/** Keep the playhead roughly centered in a horizontally scrollable timeline viewport. */
export function usePlayheadFollow(
  viewportRef: RefObject<HTMLElement | null>,
  playheadLeftPx: number,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return
    const viewport = viewportRef.current
    if (!viewport) return
    const margin = Math.max(viewport.clientWidth * 0.28, 96)
    const left = viewport.scrollLeft
    const right = left + viewport.clientWidth
    if (playheadLeftPx < left + margin) {
      viewport.scrollLeft = Math.max(playheadLeftPx - margin, 0)
      return
    }
    if (playheadLeftPx > right - margin) {
      viewport.scrollLeft = Math.max(playheadLeftPx - viewport.clientWidth + margin, 0)
    }
  }, [enabled, playheadLeftPx, viewportRef])
}

export function activeTranscriptIndex(
  playheadMs: number,
  segments: ReadonlyArray<{ startMs: number; endMs: number }>,
): number {
  if (segments.length === 0) return -1
  const exact = segments.findIndex((segment) => playheadMs >= segment.startMs && playheadMs < segment.endMs)
  if (exact >= 0) return exact
  let nearest = -1
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const [index, segment] of segments.entries()) {
    const distance = Math.min(Math.abs(playheadMs - segment.startMs), Math.abs(playheadMs - segment.endMs))
    if (distance < nearestDistance && distance <= 400) {
      nearest = index
      nearestDistance = distance
    }
  }
  return nearest
}
