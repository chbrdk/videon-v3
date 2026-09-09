import {
  buildCutTimeline,
  cutTotalDurationMs,
  findTimelineItemAtCutMs,
  type CutTimelineScene,
} from '@/lib/cut-timeline'

export type ProgramExportSlice =
  | {
      kind: 'media'
      sceneId: string
      mediaAssetId: string
      startMs: number
      endMs: number
    }
  | { kind: 'black'; durationMs: number }

/**
 * Flatten free-arrange timeline into concat-ready slices.
 * Gaps → black; overlaps → winner (higher position) only.
 */
export function buildProgramExportSlices(scenes: CutTimelineScene[]): ProgramExportSlice[] {
  const timeline = buildCutTimeline(scenes)
  const total = cutTotalDurationMs(scenes)
  if (timeline.length === 0 || total <= 0) return []

  const boundaries = new Set<number>([0, total])
  for (const item of timeline) {
    boundaries.add(item.cutStartMs)
    boundaries.add(item.cutEndMs)
  }
  const sorted = [...boundaries].sort((a, b) => a - b)
  const raw: ProgramExportSlice[] = []

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const from = sorted[i]!
    const to = sorted[i + 1]!
    if (to <= from) continue
    const mid = from + Math.floor((to - from) / 2)
    const winner = findTimelineItemAtCutMs(timeline, mid)
    if (!winner || mid >= winner.cutEndMs || mid < winner.cutStartMs) {
      raw.push({ kind: 'black', durationMs: to - from })
      continue
    }
    const sourceStart = winner.scene.startMs + (from - winner.cutStartMs)
    const sourceEnd = winner.scene.startMs + (to - winner.cutStartMs)
    raw.push({
      kind: 'media',
      sceneId: winner.scene.id,
      mediaAssetId: winner.scene.mediaAssetId,
      startMs: sourceStart,
      endMs: sourceEnd,
    })
  }

  return mergeProgramExportSlices(raw)
}

export function mergeProgramExportSlices(slices: ProgramExportSlice[]): ProgramExportSlice[] {
  const merged: ProgramExportSlice[] = []
  for (const slice of slices) {
    const prev = merged.at(-1)
    if (!prev) {
      merged.push(slice)
      continue
    }
    if (slice.kind === 'black' && prev.kind === 'black') {
      merged[merged.length - 1] = { kind: 'black', durationMs: prev.durationMs + slice.durationMs }
      continue
    }
    if (
      slice.kind === 'media' &&
      prev.kind === 'media' &&
      prev.sceneId === slice.sceneId &&
      prev.endMs === slice.startMs
    ) {
      merged[merged.length - 1] = { ...prev, endMs: slice.endMs }
      continue
    }
    merged.push(slice)
  }
  return merged.filter((slice) => (slice.kind === 'black' ? slice.durationMs > 0 : slice.endMs > slice.startMs))
}
