export const MIN_CUT_CLIP_MS = 500

export type CutTimelineScene = {
  id: string
  position: number
  mediaAssetId: string
  startMs: number
  endMs: number
  /** Placement on the Cut timeline (gaps/overlaps allowed). */
  timelineStartMs: number
}

export type CutTimelineItem = {
  scene: CutTimelineScene
  index: number
  durationMs: number
  cutStartMs: number
  cutEndMs: number
}

export function clipDurationMs(scene: Pick<CutTimelineScene, 'startMs' | 'endMs'>): number {
  return Math.max(scene.endMs - scene.startMs, 0)
}

/**
 * Free-arrange timeline: cutStartMs comes from timelineStartMs.
 * Sort for listing: timeline start, then position (overlap winner = higher position).
 */
export function buildCutTimeline(scenes: CutTimelineScene[]): CutTimelineItem[] {
  const ordered = [...scenes].sort((a, b) => {
    const startDiff = a.timelineStartMs - b.timelineStartMs
    if (startDiff !== 0) return startDiff
    return a.position - b.position
  })
  return ordered.map((scene, index) => {
    const durationMs = clipDurationMs(scene)
    const cutStartMs = Math.max(0, Math.floor(scene.timelineStartMs))
    return {
      scene,
      index,
      durationMs,
      cutStartMs,
      cutEndMs: cutStartMs + durationMs,
    }
  })
}

/** Program length = furthest clip end (gaps do not add unless covered). */
export function cutTotalDurationMs(scenes: CutTimelineScene[]): number {
  const timeline = buildCutTimeline(scenes)
  if (timeline.length === 0) return 0
  return timeline.reduce((max, item) => Math.max(max, item.cutEndMs), 0)
}

/**
 * At cutMs, prefer the covering clip with the highest position (overlap winner).
 * In a gap, return null (caller may hold last frame / show black).
 */
export function findTimelineItemAtCutMs(timeline: CutTimelineItem[], cutMs: number): CutTimelineItem | null {
  if (timeline.length === 0) return null
  const clamped = Math.max(cutMs, 0)
  const covering = timeline.filter((item) => clamped >= item.cutStartMs && clamped < item.cutEndMs)
  if (covering.length === 0) {
    // After last clip end: stay on last winner by end time; inside a gap: null.
    const maxEnd = timeline.reduce((max, item) => Math.max(max, item.cutEndMs), 0)
    if (clamped >= maxEnd) {
      const atEnd = timeline.filter((item) => item.cutEndMs === maxEnd)
      return atEnd.sort((a, b) => b.scene.position - a.scene.position)[0] ?? null
    }
    return null
  }
  return covering.sort((a, b) => b.scene.position - a.scene.position)[0] ?? null
}

export function sourceMsForCutPlayhead(timeline: CutTimelineItem[], cutMs: number): {
  item: CutTimelineItem
  sourceMs: number
} | null {
  const item = findTimelineItemAtCutMs(timeline, cutMs)
  if (!item) return null
  const offsetInClip = Math.min(Math.max(cutMs - item.cutStartMs, 0), item.durationMs)
  return {
    item,
    sourceMs: item.scene.startMs + offsetInClip,
  }
}

export function cutPlayheadForSourceMs(timeline: CutTimelineItem[], sceneId: string, sourceMs: number): number {
  const item = timeline.find((entry) => entry.scene.id === sceneId)
  if (!item) return 0
  const offset = Math.min(Math.max(sourceMs - item.scene.startMs, 0), item.durationMs)
  return item.cutStartMs + offset
}

export function splitSourceMsForCutPlayhead(timeline: CutTimelineItem[], cutMs: number): {
  sceneId: string
  atMs: number
} | null {
  const mapped = sourceMsForCutPlayhead(timeline, cutMs)
  if (!mapped) return null
  const { item, sourceMs } = mapped
  if (
    sourceMs <= item.scene.startMs + MIN_CUT_CLIP_MS ||
    sourceMs >= item.scene.endMs - MIN_CUT_CLIP_MS
  ) {
    return null
  }
  return { sceneId: item.scene.id, atMs: sourceMs }
}

export function canTrimScene(
  scene: Pick<CutTimelineScene, 'startMs' | 'endMs'>,
  next: { startMs?: number; endMs?: number },
): boolean {
  const startMs = next.startMs ?? scene.startMs
  const endMs = next.endMs ?? scene.endMs
  return endMs - startMs >= MIN_CUT_CLIP_MS && startMs < endMs
}

/** Contiguous backfill helper for migration / reorder convenience. */
export function contiguousTimelineStarts(
  scenes: Array<Pick<CutTimelineScene, 'id' | 'position' | 'startMs' | 'endMs'>>,
): Record<string, number> {
  const ordered = [...scenes].sort((a, b) => a.position - b.position)
  const starts: Record<string, number> = {}
  let cursor = 0
  for (const scene of ordered) {
    starts[scene.id] = cursor
    cursor += clipDurationMs(scene)
  }
  return starts
}

export type TranscriptSegment = {
  startMs: number
  endMs: number
  text: string
}

export type CutTranscriptSegment = TranscriptSegment & {
  clipIndex: number
  cutStartMs: number
  cutEndMs: number
}

export function mapTranscriptToCutTimeline(
  timeline: CutTimelineItem[],
  transcriptsByMediaId: Record<string, TranscriptSegment[]>,
): CutTranscriptSegment[] {
  const mapped: CutTranscriptSegment[] = []
  for (const item of timeline) {
    const segments = transcriptsByMediaId[item.scene.mediaAssetId] ?? []
    for (const segment of segments) {
      if (segment.endMs <= item.scene.startMs || segment.startMs >= item.scene.endMs) continue
      const clipStart = Math.max(segment.startMs, item.scene.startMs)
      const clipEnd = Math.min(segment.endMs, item.scene.endMs)
      const offsetStart = clipStart - item.scene.startMs
      const offsetEnd = clipEnd - item.scene.startMs
      mapped.push({
        startMs: clipStart,
        endMs: clipEnd,
        text: segment.text,
        clipIndex: item.index,
        cutStartMs: item.cutStartMs + offsetStart,
        cutEndMs: item.cutStartMs + offsetEnd,
      })
    }
  }
  return mapped.sort((a, b) => a.cutStartMs - b.cutStartMs)
}
