export type VideoLaneId = 'v1' | 'v2'

export type LaneRect = {
  top: number
  bottom: number
}

/**
 * Resolve V1 vs V2 drop target for free-move gestures.
 *
 * Companion lanes sit between V1 and V2 (`V1 → A1/A2/TX → V2 → …`).
 * Drop zones are the two groups split at the midpoint between V1.bottom and V2.top:
 * - above/at split → V1 group (incl. A1/A2/TX)
 * - below split → V2 group (incl. V2 companions below V2)
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

  // Prefer hard hits on the video tracks themselves when rects overlap oddly.
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
