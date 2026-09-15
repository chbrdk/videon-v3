/**
 * Seedance r2v rejects input clips shorter than ~1.8s; Seedance edit docs and our
 * catalog `durationMinSeconds` expect ≥4s. Expand the operator mark symmetrically
 * within the source media so short Cut scenes still reach the provider floor.
 */

export const DEFAULT_EDIT_INPUT_MIN_MS = 4000

export type ExpandEditRangeInput = {
  startMs: number
  endMs: number
  /** Source media duration; null/undefined → treat as unbounded for expansion. */
  mediaDurationMs?: number | null
  /** Provider floor for input video length (ms). Default 4000. */
  minInputMs?: number
}

export type ExpandEditRangeResult = {
  startMs: number
  endMs: number
  expanded: boolean
  /** True when even the full media file is shorter than the provider floor. */
  insufficient: boolean
}

export function expandEditRangeForProvider(input: ExpandEditRangeInput): ExpandEditRangeResult {
  const minInputMs = Math.max(1, Math.floor(input.minInputMs ?? DEFAULT_EDIT_INPUT_MIN_MS))
  const originalStart = Math.floor(input.startMs)
  const originalEnd = Math.floor(input.endMs)
  let start = Math.max(0, originalStart)
  let end = Math.max(start + 1, originalEnd)
  const mediaEnd =
    input.mediaDurationMs != null && Number.isFinite(input.mediaDurationMs) && input.mediaDurationMs > 0
      ? Math.floor(input.mediaDurationMs)
      : null

  if (mediaEnd != null) {
    start = Math.min(start, Math.max(0, mediaEnd - 1))
    end = Math.min(end, mediaEnd)
    if (end <= start) end = Math.min(mediaEnd, start + 1)
  }

  const selected = end - start
  if (selected >= minInputMs) {
    return { startMs: start, endMs: end, expanded: false, insufficient: false }
  }

  if (mediaEnd != null && mediaEnd < minInputMs) {
    return { startMs: 0, endMs: mediaEnd, expanded: true, insufficient: true }
  }

  const deficit = minInputMs - selected
  const left = Math.floor(deficit / 2)
  const right = deficit - left
  start = Math.max(0, start - left)
  end = end + right
  if (mediaEnd != null) {
    end = Math.min(mediaEnd, end)
  }

  if (end - start < minInputMs) {
    if (start === 0) {
      end = mediaEnd != null ? Math.min(mediaEnd, minInputMs) : minInputMs
    } else {
      start = Math.max(0, end - minInputMs)
    }
  }

  const finalDuration = end - start
  return {
    startMs: start,
    endMs: end,
    expanded: start !== originalStart || end !== originalEnd,
    insufficient: finalDuration < minInputMs,
  }
}

/** Provider input-video floor per edit model (ms). */
export function editInputMinMsForModel(modelId: string | null | undefined): number {
  const id = (modelId || '').trim()
  if (id === 'minimax_hailuo_3_edit') return 5000
  if (id === 'runway_aleph_2') return 2000
  // seedance mini / draft / legacy seedance ids — ≥4s
  return DEFAULT_EDIT_INPUT_MIN_MS
}
