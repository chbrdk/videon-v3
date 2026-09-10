export type RippleClip = {
  id: string
  timelineStartMs: number
  durationMs: number
}

/** Shift every clip that starts at/after pivotEnd by deltaMs. */
export function rippleShiftLaterClips(
  clips: RippleClip[],
  pivot: { id: string; originStartMs: number; newStartMs: number; durationMs: number },
): Array<{ id: string; timelineStartMs: number }> {
  const deltaMs = pivot.newStartMs - pivot.originStartMs
  if (deltaMs === 0) return [{ id: pivot.id, timelineStartMs: Math.max(0, pivot.newStartMs) }]

  const pivotEnd = pivot.originStartMs + Math.max(0, pivot.durationMs)
  const moves: Array<{ id: string; timelineStartMs: number }> = [
    { id: pivot.id, timelineStartMs: Math.max(0, pivot.newStartMs) },
  ]
  for (const clip of clips) {
    if (clip.id === pivot.id) continue
    if (clip.timelineStartMs + 1 >= pivotEnd) {
      moves.push({ id: clip.id, timelineStartMs: Math.max(0, clip.timelineStartMs + deltaMs) })
    }
  }
  return moves
}

/** After deleting a clip, pull later clips left by its duration. */
export function rippleCloseGapAfterDelete(
  clips: RippleClip[],
  removed: { id: string; timelineStartMs: number; durationMs: number },
): Array<{ id: string; timelineStartMs: number }> {
  const durationMs = Math.max(0, removed.durationMs)
  const removedEnd = removed.timelineStartMs + durationMs
  const moves: Array<{ id: string; timelineStartMs: number }> = []
  for (const clip of clips) {
    if (clip.id === removed.id) continue
    if (clip.timelineStartMs + 1 >= removedEnd) {
      moves.push({ id: clip.id, timelineStartMs: Math.max(0, clip.timelineStartMs - durationMs) })
    }
  }
  return moves
}

/** After a Resize trim, shift later clips by how much the trimmed clip's end moved. */
export function rippleMovesAfterResize(
  clips: RippleClip[],
  trimmed: {
    id: string
    originTimelineStartMs: number
    originDurationMs: number
    newTimelineStartMs: number
    newDurationMs: number
  },
): Array<{ id: string; timelineStartMs: number }> {
  const oldEnd = trimmed.originTimelineStartMs + Math.max(0, trimmed.originDurationMs)
  const newEnd = trimmed.newTimelineStartMs + Math.max(0, trimmed.newDurationMs)
  const deltaEnd = newEnd - oldEnd
  if (deltaEnd === 0) return []

  const moves: Array<{ id: string; timelineStartMs: number }> = []
  for (const clip of clips) {
    if (clip.id === trimmed.id) continue
    if (clip.timelineStartMs + 1 >= oldEnd) {
      moves.push({ id: clip.id, timelineStartMs: Math.max(0, clip.timelineStartMs + deltaEnd) })
    }
  }
  return moves
}

export function expandGroupMoveWithRipple(
  clips: RippleClip[],
  group: Array<{ id: string; originStartMs: number; newStartMs: number }>,
): Array<{ id: string; timelineStartMs: number }> {
  if (group.length === 0) return []
  // Use leftmost primary as ripple pivot for later clips outside the group.
  const sorted = [...group].sort((a, b) => a.originStartMs - b.originStartMs)
  const primary = sorted[0]!
  const primaryClip = clips.find((clip) => clip.id === primary.id)
  const durationMs = primaryClip?.durationMs ?? 0
  const base = rippleShiftLaterClips(clips, {
    id: primary.id,
    originStartMs: primary.originStartMs,
    newStartMs: primary.newStartMs,
    durationMs,
  })
  const byId = new Map(base.map((move) => [move.id, move.timelineStartMs]))
  for (const item of group) {
    byId.set(item.id, Math.max(0, item.newStartMs))
  }
  return [...byId.entries()].map(([id, timelineStartMs]) => ({ id, timelineStartMs }))
}
