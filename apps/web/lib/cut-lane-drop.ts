export type VideoLaneId = 'v1' | 'v2'

export type LaneRect = {
  top: number
  bottom: number
}

const MIN_TRACK_PX = 2

function height(rect: LaneRect): number {
  return Math.max(0, rect.bottom - rect.top)
}

/**
 * Resolve V1 vs V2 drop target for free-move gestures.
 *
 * Companion lanes sit between V1 and V2 (`V1 → A1/A2/TX → V2 → …`).
 * Drop zones are the two groups split at the midpoint between V1.bottom and V2.top.
 * Collapsed / near-zero-height tracks fall back to edge rules so hide/collapse
 * cannot pin the drop to the wrong lane.
 */
export function resolveVideoLaneDrop(input: {
  clientY: number
  v1: LaneRect | null
  v2: LaneRect | null
}): VideoLaneId | null {
  const { clientY, v1, v2 } = input
  if (!v1 && !v2) return null
  if (!v1) return 'v2'
  if (!v2) return 'v1'

  const v1Ok = height(v1) >= MIN_TRACK_PX
  const v2Ok = height(v2) >= MIN_TRACK_PX

  if (v1Ok && !v2Ok) {
    if (v2.top > v1.bottom) {
      const splitY = (v1.bottom + v2.top) / 2
      return clientY < splitY ? 'v1' : 'v2'
    }
    return clientY > v1.bottom ? 'v2' : 'v1'
  }
  if (v2Ok && !v1Ok) {
    if (v2.top > v1.bottom) {
      const splitY = (v1.bottom + v2.top) / 2
      return clientY < splitY ? 'v1' : 'v2'
    }
    return clientY < v2.top ? 'v1' : 'v2'
  }
  if (!v1Ok && !v2Ok) {
    return clientY < (v1.top + v2.bottom) / 2 ? 'v1' : 'v2'
  }

  const inV1 = clientY >= v1.top && clientY <= v1.bottom
  const inV2 = clientY >= v2.top && clientY <= v2.bottom
  if (inV1 && !inV2) return 'v1'
  if (inV2 && !inV1) return 'v2'
  if (inV1 && inV2) {
    const mid1 = (v1.top + v1.bottom) / 2
    const mid2 = (v2.top + v2.bottom) / 2
    return Math.abs(clientY - mid2) <= Math.abs(clientY - mid1) ? 'v2' : 'v1'
  }

  const splitY = (v1.bottom + v2.top) / 2
  return clientY < splitY ? 'v1' : 'v2'
}

/** Highlight only the opposite lane while dragging. */
export function laneDropHighlight(input: {
  fromLane: VideoLaneId
  targetLane: VideoLaneId | null
  canMoveToV2?: boolean
}): VideoLaneId | null {
  if (!input.targetLane || input.targetLane === input.fromLane) return null
  if (input.fromLane === 'v1' && input.targetLane === 'v2' && input.canMoveToV2 === false) {
    return null
  }
  return input.targetLane
}
