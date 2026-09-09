export type ViewportTimeRange = {
  startMs: number
  endMs: number
}

export function viewportTimeRange(input: {
  scrollLeft: number
  clientWidth: number
  msPerPixel: number
  padMs?: number
}): ViewportTimeRange {
  const mpp = Math.max(input.msPerPixel, 0.001)
  const pad = input.padMs ?? mpp * 120
  const startMs = Math.max(0, input.scrollLeft * mpp - pad)
  const endMs = (input.scrollLeft + Math.max(input.clientWidth, 1)) * mpp + pad
  return { startMs, endMs }
}

export function clipIntersectsView(
  clip: { cutStartMs: number; cutEndMs: number },
  view: ViewportTimeRange,
): boolean {
  return clip.cutEndMs >= view.startMs && clip.cutStartMs <= view.endMs
}
