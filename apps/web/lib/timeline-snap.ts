/** Snap Cut playhead / drop / drag times to nearby clip edges. */

export const CUT_SNAP_THRESHOLD_MS = 120
export const CUT_SNAP_THRESHOLD_PX = 10

export function snapCutMs(
  rawMs: number,
  snapPoints: number[],
  thresholdMs: number = CUT_SNAP_THRESHOLD_MS,
): number {
  let best = rawMs
  let bestDist = thresholdMs
  for (const point of snapPoints) {
    const dist = Math.abs(point - rawMs)
    if (dist <= bestDist) {
      bestDist = dist
      best = point
    }
  }
  return Math.max(0, Math.round(best))
}

export type SnapResult = {
  ms: number
  snapped: boolean
  guideMs: number | null
}

/** Pixel-stable snap: threshold scales with zoom via msPerPixel. */
export function snapCutMsToPixels(
  rawMs: number,
  snapPoints: number[],
  msPerPixel: number,
  thresholdPx: number = CUT_SNAP_THRESHOLD_PX,
): SnapResult {
  const thresholdMs = Math.max(1, Math.round(Math.max(msPerPixel, 0.001) * thresholdPx))
  let best = rawMs
  let bestDist = thresholdMs
  let snapped = false
  for (const point of snapPoints) {
    const dist = Math.abs(point - rawMs)
    if (dist <= bestDist) {
      bestDist = dist
      best = point
      snapped = true
    }
  }
  const ms = Math.max(0, Math.round(best))
  return { ms, snapped, guideMs: snapped ? ms : null }
}

export type CutSnapEdge = { cutStartMs: number; cutEndMs: number }

function edgesNearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1
}

export function buildCutSnapPoints(input: {
  v1?: CutSnapEdge[]
  v2?: CutSnapEdge[]
  playheadMs?: number
  /** Exclude these edges (active clip) so a drag does not snap to itself. */
  exclude?: CutSnapEdge | null
}): number[] {
  const points = new Set<number>([0])
  const exclude = input.exclude ?? null

  const addEdge = (edge: CutSnapEdge) => {
    if (
      exclude &&
      edgesNearlyEqual(edge.cutStartMs, exclude.cutStartMs) &&
      edgesNearlyEqual(edge.cutEndMs, exclude.cutEndMs)
    ) {
      return
    }
    points.add(Math.round(edge.cutStartMs))
    points.add(Math.round(edge.cutEndMs))
  }

  for (const item of input.v1 ?? []) addEdge(item)
  for (const item of input.v2 ?? []) addEdge(item)
  if (input.playheadMs != null && Number.isFinite(input.playheadMs)) {
    points.add(Math.round(input.playheadMs))
  }
  return [...points].sort((a, b) => a - b)
}

/** @deprecated Prefer buildCutSnapPoints — kept for existing call sites/tests. */
export function cutEdgeSnapPoints(
  items: CutSnapEdge[],
  playheadMs?: number,
): number[] {
  return buildCutSnapPoints({ v1: items, playheadMs })
}

/** Keep time-under-cursor stable when zoom (ms/px) changes. */
export function scrollLeftAfterZoom(input: {
  scrollLeft: number
  pointerOffsetX: number
  oldMsPerPixel: number
  newMsPerPixel: number
}): number {
  const oldMpp = Math.max(input.oldMsPerPixel, 0.001)
  const newMpp = Math.max(input.newMsPerPixel, 0.001)
  const timeUnderCursor = (input.scrollLeft + input.pointerOffsetX) * oldMpp
  return Math.max(0, timeUnderCursor / newMpp - input.pointerOffsetX)
}
