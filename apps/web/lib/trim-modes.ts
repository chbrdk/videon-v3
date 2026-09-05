import { MIN_CUT_CLIP_MS } from '@/lib/cut-timeline'

export type TrimMode = 'trim' | 'ripple' | 'roll'

export function computeTrimPreview(input: {
  mode: TrimMode
  edge: 'start' | 'end'
  startMs: number
  endMs: number
  sourceDelta: number
  nextClip?: { startMs: number; endMs: number; sameMedia: boolean } | null
}): { startMs: number; endMs: number; rollBoundaryMs?: number } | null {
  const minDuration = MIN_CUT_CLIP_MS
  if (input.edge === 'start') {
    const nextStart = Math.min(input.startMs + input.sourceDelta, input.endMs - minDuration)
    const startMs = Math.max(0, nextStart)
    if (input.mode === 'roll' && input.nextClip?.sameMedia) {
      const rollBoundaryMs = startMs
      if (rollBoundaryMs <= input.nextClip.startMs + minDuration || rollBoundaryMs >= input.nextClip.endMs - minDuration) {
        return null
      }
      return { startMs, endMs: input.endMs, rollBoundaryMs }
    }
    return { startMs, endMs: input.endMs }
  }

  const nextEnd = Math.max(input.endMs + input.sourceDelta, input.startMs + minDuration)
  const endMs = nextEnd
  if (input.mode === 'roll' && input.nextClip?.sameMedia) {
    const rollBoundaryMs = endMs
    if (rollBoundaryMs <= input.startMs + minDuration || rollBoundaryMs >= input.nextClip.endMs - minDuration) {
      return null
    }
    return { startMs: input.startMs, endMs, rollBoundaryMs }
  }
  return { startMs: input.startMs, endMs }
}
