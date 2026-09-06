import type { CutTimelineItem } from '@/lib/cut-timeline'

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

export function nextPlaybackTarget(
  timeline: CutTimelineItem[],
  activeIndex: number,
): NextPlaybackTarget | null {
  const next = timeline[activeIndex + 1]
  if (!next) return null
  return {
    index: next.index,
    cutStartMs: next.cutStartMs,
    sourceStartMs: next.scene.startMs,
    mediaAssetId: next.scene.mediaAssetId,
  }
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
