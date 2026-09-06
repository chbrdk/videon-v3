import { MIN_CUT_CLIP_MS } from '@/lib/cut-timeline'

export type TrimMode = 'trim' | 'ripple' | 'roll'

export const TRIM_MODE_LABELS: Record<TrimMode, string> = {
  trim: 'TRIM (Slip)',
  ripple: 'RIPPLE',
  roll: 'ROLL',
}

export const TRIM_MODE_HELP: Record<TrimMode, string> = {
  trim: 'Slip: Quellfenster verschieben — Dauer und Sequenzlänge bleiben gleich',
  ripple: 'Ripple: Kante ändert die Clip-Dauer — nachfolgende Clips rücken nach',
  roll: 'Roll: gemeinsame Schnittgrenze zweier Clips derselben Quelle',
}

export type TrimPreview = {
  startMs: number
  endMs: number
  rollBoundaryMs?: number
}

/**
 * TRIM = Slip (both edges move, duration locked).
 * RIPPLE = one edge changes duration (sequence length follows via contiguous timeline).
 * ROLL = shared boundary between neighboring same-media clips.
 */
export function computeTrimPreview(input: {
  mode: TrimMode
  edge: 'start' | 'end'
  startMs: number
  endMs: number
  sourceDelta: number
  mediaDurationMs: number
  nextClip?: { startMs: number; endMs: number; sameMedia: boolean } | null
}): TrimPreview | null {
  const minDuration = MIN_CUT_CLIP_MS
  const mediaDurationMs = Math.max(input.mediaDurationMs, input.endMs, minDuration)
  const duration = input.endMs - input.startMs
  if (duration < minDuration) return null

  if (input.mode === 'trim') {
    return computeSlipPreview({
      startMs: input.startMs,
      endMs: input.endMs,
      sourceDelta: input.sourceDelta,
      mediaDurationMs,
    })
  }

  if (input.mode === 'roll') {
    return computeRollPreview({
      edge: input.edge,
      startMs: input.startMs,
      endMs: input.endMs,
      sourceDelta: input.sourceDelta,
      nextClip: input.nextClip ?? null,
      minDuration,
    })
  }

  return computeRipplePreview({
    edge: input.edge,
    startMs: input.startMs,
    endMs: input.endMs,
    sourceDelta: input.sourceDelta,
    mediaDurationMs,
    minDuration,
  })
}

function computeSlipPreview(input: {
  startMs: number
  endMs: number
  sourceDelta: number
  mediaDurationMs: number
}): TrimPreview | null {
  const duration = input.endMs - input.startMs
  let startMs = input.startMs + input.sourceDelta
  let endMs = input.endMs + input.sourceDelta
  if (startMs < 0) {
    endMs -= startMs
    startMs = 0
  }
  if (endMs > input.mediaDurationMs) {
    const overflow = endMs - input.mediaDurationMs
    startMs -= overflow
    endMs = input.mediaDurationMs
  }
  if (startMs < 0 || endMs - startMs !== duration) return null
  if (startMs === input.startMs && endMs === input.endMs) return null
  return { startMs, endMs }
}

function computeRipplePreview(input: {
  edge: 'start' | 'end'
  startMs: number
  endMs: number
  sourceDelta: number
  mediaDurationMs: number
  minDuration: number
}): TrimPreview | null {
  if (input.edge === 'start') {
    const startMs = Math.min(
      Math.max(0, input.startMs + input.sourceDelta),
      input.endMs - input.minDuration,
    )
    if (startMs === input.startMs) return null
    return { startMs, endMs: input.endMs }
  }

  const endMs = Math.max(
    input.startMs + input.minDuration,
    Math.min(input.mediaDurationMs, input.endMs + input.sourceDelta),
  )
  if (endMs === input.endMs) return null
  return { startMs: input.startMs, endMs }
}

function computeRollPreview(input: {
  edge: 'start' | 'end'
  startMs: number
  endMs: number
  sourceDelta: number
  nextClip: { startMs: number; endMs: number; sameMedia: boolean } | null
  minDuration: number
}): TrimPreview | null {
  if (!input.nextClip?.sameMedia) return null

  if (input.edge === 'start') {
    const startMs = Math.min(input.startMs + input.sourceDelta, input.endMs - input.minDuration)
    const clampedStart = Math.max(0, startMs)
    const rollBoundaryMs = clampedStart
    if (
      rollBoundaryMs <= input.nextClip.startMs + input.minDuration ||
      rollBoundaryMs >= input.nextClip.endMs - input.minDuration
    ) {
      return null
    }
    return { startMs: clampedStart, endMs: input.endMs, rollBoundaryMs }
  }

  const endMs = Math.max(input.endMs + input.sourceDelta, input.startMs + input.minDuration)
  const rollBoundaryMs = endMs
  if (
    rollBoundaryMs <= input.startMs + input.minDuration ||
    rollBoundaryMs >= input.nextClip.endMs - input.minDuration
  ) {
    return null
  }
  return { startMs: input.startMs, endMs, rollBoundaryMs }
}
