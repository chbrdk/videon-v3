import {
  buildCutTimeline,
  cutTotalDurationMs,
  type CutTimelineScene,
} from '@/lib/cut-timeline'
import {
  findProgramVideoAtCutMs,
  type ProgramVideoClipRef,
} from '@/lib/cut-program-hit'

export type ProgramExportSlice =
  | {
      kind: 'media'
      sceneId: string
      mediaAssetId: string
      startMs: number
      endMs: number
    }
  | { kind: 'black'; durationMs: number }

/** Latest timeline end among VO bus clips (for MP4 pad / Premiere parity). */
export function busClipsEndMs(
  clips: Array<{ timelineStartMs: number; startMs: number; endMs: number }>,
): number {
  return clips.reduce((max, clip) => {
    const end = Math.max(0, clip.timelineStartMs) + Math.max(0, clip.endMs - clip.startMs)
    return Math.max(max, end)
  }, 0)
}

function programTotalMs(
  scenes: CutTimelineScene[],
  v2Clips: ProgramVideoClipRef[],
  busEndMs = 0,
): number {
  const v1 = cutTotalDurationMs(scenes)
  const v2 = v2Clips.reduce((max, clip) => {
    const end = Math.max(0, clip.timelineStartMs) + Math.max(0, clip.endMs - clip.startMs)
    return Math.max(max, end)
  }, 0)
  return Math.max(v1, v2, Math.max(0, busEndMs))
}

/**
 * Flatten free-arrange timeline into concat-ready slices.
 * Gaps → black; V1 overlaps → higher position; unmuted V2 covers V1.
 * Optional `busEndMs` extends the program with black so VO past picture is kept.
 */
export function buildProgramExportSlices(
  scenes: CutTimelineScene[],
  options?: { v2Clips?: ProgramVideoClipRef[]; v2Muted?: boolean; busEndMs?: number },
): ProgramExportSlice[] {
  const v2Clips = options?.v2Clips ?? []
  const v2Muted = Boolean(options?.v2Muted)
  const total = programTotalMs(scenes, v2Muted ? [] : v2Clips, options?.busEndMs ?? 0)
  if (total <= 0) return []

  const timeline = buildCutTimeline(scenes)
  const boundaries = new Set<number>([0, total])
  for (const item of timeline) {
    boundaries.add(item.cutStartMs)
    boundaries.add(item.cutEndMs)
  }
  if (!v2Muted) {
    for (const clip of v2Clips) {
      const start = Math.max(0, Math.floor(clip.timelineStartMs))
      boundaries.add(start)
      boundaries.add(start + Math.max(0, clip.endMs - clip.startMs))
    }
  }
  const sorted = [...boundaries].sort((a, b) => a - b)
  const raw: ProgramExportSlice[] = []

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const from = sorted[i]!
    const to = sorted[i + 1]!
    if (to <= from) continue
    const mid = from + Math.floor((to - from) / 2)
    const hit = findProgramVideoAtCutMs({
      cutMs: mid,
      v1Scenes: scenes,
      v2Clips,
      v2Muted,
    })
    if (!hit) {
      raw.push({ kind: 'black', durationMs: to - from })
      continue
    }
    if (hit.lane === 'v2') {
      // Past overlay end → black (V2 finder has no hold-at-end).
      if (mid >= hit.cutEndMs || from >= hit.cutEndMs) {
        raw.push({ kind: 'black', durationMs: to - from })
        continue
      }
      const sourceStart = hit.clip.startMs + (from - hit.cutStartMs)
      const sourceEnd = hit.clip.startMs + (to - hit.cutStartMs)
      raw.push({
        kind: 'media',
        sceneId: hit.clip.id,
        mediaAssetId: hit.clip.mediaAssetId,
        startMs: sourceStart,
        endMs: sourceEnd,
      })
      continue
    }
    // V1 playhead holds last frame after cut end — for export that MUST become black pad.
    if (mid >= hit.item.cutEndMs || from >= hit.item.cutEndMs) {
      raw.push({ kind: 'black', durationMs: to - from })
      continue
    }
    const sourceStart = hit.item.scene.startMs + (from - hit.item.cutStartMs)
    const sourceEnd = hit.item.scene.startMs + (to - hit.item.cutStartMs)
    raw.push({
      kind: 'media',
      sceneId: hit.item.scene.id,
      mediaAssetId: hit.item.scene.mediaAssetId,
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
