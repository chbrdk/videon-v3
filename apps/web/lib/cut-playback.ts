import { findTimelineItemAtCutMs, type CutTimelineItem } from '@/lib/cut-timeline'

export type ClipTransition = 'same-media-seek' | 'cross-media-swap' | 'sequence-end'

export type PlaybackClipRef = {
  mediaAssetId: string
  startMs: number
  endMs: number
}

export type NextPlaybackTarget = {
  index: number
  cutStartMs: number
  sourceStartMs: number
  mediaAssetId: string
}

/** Advance when source time reaches the last frame before clip end. */
export function shouldAdvanceAtSourceMs(input: {
  sourceMs: number
  clipEndMs: number
  frameMs: number
}): boolean {
  const lead = Math.max(1, Math.floor(input.frameMs))
  return input.sourceMs >= input.clipEndMs - lead
}

/**
 * Next program target after the active clip ends.
 * Skips gaps (jumps to next covering winner); respects overlap winner by time.
 */
export function nextPlaybackTarget(
  timeline: CutTimelineItem[],
  activeIndex: number,
): NextPlaybackTarget | null {
  const current = timeline[activeIndex]
  if (!current) return null

  const boundaries = new Set<number>()
  for (const item of timeline) {
    boundaries.add(item.cutStartMs)
    boundaries.add(item.cutEndMs)
  }
  const sorted = [...boundaries].sort((a, b) => a - b)
  for (const atMs of sorted) {
    if (atMs < current.cutEndMs) continue
    const item = findTimelineItemAtCutMs(timeline, atMs)
    if (!item || item.scene.id === current.scene.id) continue
    const cutStartMs = Math.max(item.cutStartMs, current.cutEndMs)
    if (cutStartMs >= item.cutEndMs) continue
    return {
      index: item.index,
      cutStartMs,
      sourceStartMs: item.scene.startMs + (cutStartMs - item.cutStartMs),
      mediaAssetId: item.scene.mediaAssetId,
    }
  }
  return null
}

export function resolveClipTransition(input: {
  current: PlaybackClipRef | null | undefined
  next: PlaybackClipRef | null | undefined
}): ClipTransition {
  if (!input.next) return 'sequence-end'
  if (!input.current) return 'cross-media-swap'
  if (input.current.mediaAssetId === input.next.mediaAssetId) return 'same-media-seek'
  return 'cross-media-swap'
}
