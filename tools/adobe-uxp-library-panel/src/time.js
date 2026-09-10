/** Milliseconds ↔ frames for Premiere insert. */

export function msToFrames(ms, fps) {
  const rate = Number(fps)
  if (!Number.isFinite(rate) || rate <= 0) return 0
  return Math.round((Math.max(0, Number(ms) || 0) / 1000) * rate)
}

export function sceneInOutFrames(hit, fps) {
  if (hit.startMs == null || hit.endMs == null || hit.endMs <= hit.startMs) {
    return null
  }
  return {
    inPoint: msToFrames(hit.startMs, fps),
    outPoint: msToFrames(hit.endMs, fps),
  }
}
