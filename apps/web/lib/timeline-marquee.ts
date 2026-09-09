export type MarqueeRect = { left: number; top: number; right: number; bottom: number }

export type MarqueeClipBox = {
  id: string
  left: number
  top: number
  right: number
  bottom: number
}

export function normalizeMarqueeRect(a: { x: number; y: number }, b: { x: number; y: number }): MarqueeRect {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x),
    bottom: Math.max(a.y, b.y),
  }
}

export function rectsIntersect(a: MarqueeRect, b: MarqueeRect): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom)
}

export function marqueeHitClipIds(rect: MarqueeRect, clips: MarqueeClipBox[]): string[] {
  return clips.filter((clip) => rectsIntersect(rect, clip)).map((clip) => clip.id)
}
