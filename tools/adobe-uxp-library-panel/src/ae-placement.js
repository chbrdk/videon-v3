/**
 * Pure AE placement math (Legacy port, corrected source trim).
 * Spec: adobe-uxp-library-panel.md Wave 1.5
 */

export function msToSeconds(ms) {
  return Math.max(0, Number(ms) || 0) / 1000
}

/**
 * Source trim window in seconds. Null → use full footage.
 * @param {{ startMs?: number | null, endMs?: number | null }} hit
 */
export function sceneSourceWindowSec(hit) {
  if (hit.startMs == null || hit.endMs == null || hit.endMs <= hit.startMs) return null
  const inPointSec = msToSeconds(hit.startMs)
  const outPointSec = msToSeconds(hit.endMs)
  return {
    inPointSec,
    outPointSec,
    durationSec: Math.max(0, outPointSec - inPointSec),
  }
}

/**
 * Layer timing so the scene source range plays at `compTimeSec`.
 * startTime is shifted so source inPoint aligns with inPoint on the comp.
 */
export function aeLayerTiming(hit, compTimeSec) {
  const window = sceneSourceWindowSec(hit)
  const t = Math.max(0, Number(compTimeSec) || 0)
  if (!window) {
    return {
      startTime: t,
      inPoint: t,
      outPoint: null,
      durationSec: null,
      fullFootage: true,
    }
  }
  return {
    startTime: t - window.inPointSec,
    inPoint: t,
    outPoint: t + window.durationSec,
    durationSec: window.durationSec,
    fullFootage: false,
  }
}

/**
 * @param {Array<{ id: string, startMs?: number | null, endMs?: number | null }>} hits
 * @param {{ sequential?: boolean, gapFrames?: number, fps?: number, startAtSec?: number }} opts
 */
export function planAeInserts(hits, opts = {}) {
  const sequential = opts.sequential !== false
  const fps = Number(opts.fps) > 0 ? Number(opts.fps) : 25
  const gapFrames = Math.max(0, Number(opts.gapFrames) || 0)
  const gapSec = gapFrames / fps
  let cursor = Math.max(0, Number(opts.startAtSec) || 0)

  return hits.map((hit, index) => {
    const timing = aeLayerTiming(hit, cursor)
    const durationSec =
      timing.durationSec != null
        ? timing.durationSec
        : Math.max(0, msToSeconds((hit.endMs ?? 0) - (hit.startMs ?? 0))) || 1
    const plan = {
      index,
      hitId: hit.id,
      compTimeSec: cursor,
      ...timing,
    }
    if (sequential) cursor += durationSec + gapSec
    return plan
  })
}
