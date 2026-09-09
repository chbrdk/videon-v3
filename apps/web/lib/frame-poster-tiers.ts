/** Width tiers for Bin / timeline / evidence+assistant — client-safe (no node:). */

export const FRAME_WIDTH_TIERS = [160, 240, 480] as const
export type FrameWidthTier = (typeof FRAME_WIDTH_TIERS)[number]

export const FRAME_WIDTH_BIN = 160
export const FRAME_WIDTH_TIMELINE = 240
export const FRAME_WIDTH_DEFAULT = 480

/** Bucket seek times so Frame API + browser/S3 cache reuse posters. */
export function mediaFrameSeekMs(atMs: number): number {
  if (!Number.isFinite(atMs) || atMs < 0) return 1000
  return Math.round(atMs / 250) * 250
}

export function snapFrameWidth(raw: number | null | undefined): FrameWidthTier {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return FRAME_WIDTH_DEFAULT
  let best: FrameWidthTier = FRAME_WIDTH_DEFAULT
  let bestDist = Number.POSITIVE_INFINITY
  for (const tier of FRAME_WIDTH_TIERS) {
    const dist = Math.abs(tier - raw)
    if (dist < bestDist) {
      best = tier
      bestDist = dist
    }
  }
  return best
}
