export const MIN_CUT_CLIP_MS = 500

export type CutTimelineScene = {
  id: string
  position: number
  mediaAssetId: string
  startMs: number
  endMs: number
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

export function buildCutTimeline(scenes: CutTimelineScene[]): CutTimelineItem[] {
  const ordered = [...scenes].sort((a, b) => a.position - b.position)
  let cutStartMs = 0
  return ordered.map((scene, index) => {
    const durationMs = clipDurationMs(scene)
    const item: CutTimelineItem = {
      scene,
      index,
      durationMs,
      cutStartMs,
      cutEndMs: cutStartMs + durationMs,
    }
    cutStartMs += durationMs
    return item
  })
}

export function cutTotalDurationMs(scenes: CutTimelineScene[]): number {
  return buildCutTimeline(scenes).reduce((total, item) => total + item.durationMs, 0)
}

export function findTimelineItemAtCutMs(timeline: CutTimelineItem[], cutMs: number): CutTimelineItem | null {
  if (timeline.length === 0) return null
  const clamped = Math.max(cutMs, 0)
  const hit =
    timeline.find((item) => clamped >= item.cutStartMs && clamped < item.cutEndMs) ??
    timeline[timeline.length - 1]
  return hit ?? null
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
