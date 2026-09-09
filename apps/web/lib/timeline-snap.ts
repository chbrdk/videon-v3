/** Snap Cut playhead / drop times to nearby clip edges. */

export const CUT_SNAP_THRESHOLD_MS = 120

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

export function cutEdgeSnapPoints(
  items: Array<{ cutStartMs: number; cutEndMs: number }>,
  playheadMs?: number,
): number[] {
  const points = new Set<number>([0])
  for (const item of items) {
    points.add(item.cutStartMs)
    points.add(item.cutEndMs)
  }
  if (playheadMs != null && Number.isFinite(playheadMs)) points.add(Math.round(playheadMs))
  return [...points].sort((a, b) => a - b)
}
