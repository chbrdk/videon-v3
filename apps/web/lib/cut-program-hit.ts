import {
  buildCutTimeline,
  findTimelineItemAtCutMs,
  type CutTimelineItem,
  type CutTimelineScene,
} from '@/lib/cut-timeline'

export type ProgramVideoClipRef = {
  id: string
  mediaAssetId: string
  position: number
  timelineStartMs: number
  startMs: number
  endMs: number
}

export type ProgramVideoHit =
  | { lane: 'v2'; clip: ProgramVideoClipRef; sourceMs: number; cutStartMs: number; cutEndMs: number }
  | { lane: 'v1'; item: CutTimelineItem; sourceMs: number }
  | null

function videoClipDurationMs(clip: Pick<ProgramVideoClipRef, 'startMs' | 'endMs'>): number {
  return Math.max(0, clip.endMs - clip.startMs)
}

/** Winner on V2 at cutMs (higher position wins). */
export function findVideoOverlayClipAtCutMs(
  clips: ProgramVideoClipRef[],
  cutMs: number,
): { clip: ProgramVideoClipRef; cutStartMs: number; cutEndMs: number; sourceMs: number } | null {
  const clamped = Math.max(0, cutMs)
  const covering = clips
    .map((clip) => {
      const cutStartMs = Math.max(0, Math.floor(clip.timelineStartMs))
      const cutEndMs = cutStartMs + videoClipDurationMs(clip)
      return { clip, cutStartMs, cutEndMs }
    })
    .filter((entry) => clamped >= entry.cutStartMs && clamped < entry.cutEndMs)
  if (covering.length === 0) return null
  const winner = covering.sort((a, b) => b.clip.position - a.clip.position)[0]!
  return {
    ...winner,
    sourceMs: winner.clip.startMs + (clamped - winner.cutStartMs),
  }
}

/**
 * Program video at cutMs: unmuted V2 overlay wins over V1.
 */
export function findProgramVideoAtCutMs(input: {
  cutMs: number
  v1Scenes: CutTimelineScene[]
  v2Clips: ProgramVideoClipRef[]
  v2Muted?: boolean
}): ProgramVideoHit {
  if (!input.v2Muted) {
    const overlay = findVideoOverlayClipAtCutMs(input.v2Clips, input.cutMs)
    if (overlay) {
      return {
        lane: 'v2',
        clip: overlay.clip,
        sourceMs: overlay.sourceMs,
        cutStartMs: overlay.cutStartMs,
        cutEndMs: overlay.cutEndMs,
      }
    }
  }
  const timeline = buildCutTimeline(input.v1Scenes)
  const item = findTimelineItemAtCutMs(timeline, input.cutMs)
  if (!item) return null
  const offset = Math.min(Math.max(input.cutMs - item.cutStartMs, 0), item.durationMs)
  return {
    lane: 'v1',
    item,
    sourceMs: item.scene.startMs + offset,
  }
}
