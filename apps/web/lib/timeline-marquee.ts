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

export type LaneMarqueeLane = 'v1' | 'v2' | 'audio'

export type LaneMarqueeState = {
  lane: LaneMarqueeLane
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Empty-lane drag marquee; tiny drag falls through to onEmptyClick (seek). */
export function beginLaneMarquee(input: {
  clientX: number
  clientY: number
  trackRect: DOMRect
  lane: LaneMarqueeLane
  shiftKey: boolean
  getClipBoxes: (trackHeight: number) => MarqueeClipBox[]
  setMarquee: (state: LaneMarqueeState | null) => void
  setSelection: (
    next: Array<{ lane: LaneMarqueeLane; id: string }>,
    additive: boolean,
  ) => void
  onEmptyClick: () => void
}): void {
  const origin = {
    x: input.clientX - input.trackRect.left,
    y: input.clientY - input.trackRect.top,
  }
  input.setMarquee({
    lane: input.lane,
    x0: origin.x,
    y0: origin.y,
    x1: origin.x,
    y1: origin.y,
  })
  const onMove = (moveEvent: PointerEvent) => {
    input.setMarquee({
      lane: input.lane,
      x0: origin.x,
      y0: origin.y,
      x1: moveEvent.clientX - input.trackRect.left,
      y1: moveEvent.clientY - input.trackRect.top,
    })
  }
  const onUp = (upEvent: PointerEvent) => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    const end = {
      x: upEvent.clientX - input.trackRect.left,
      y: upEvent.clientY - input.trackRect.top,
    }
    const box = normalizeMarqueeRect(origin, end)
    if (Math.abs(box.right - box.left) < 4 && Math.abs(box.bottom - box.top) < 4) {
      input.setMarquee(null)
      input.onEmptyClick()
      return
    }
    const hits = marqueeHitClipIds(box, input.getClipBoxes(input.trackRect.height))
    input.setSelection(
      hits.map((id) => ({ lane: input.lane, id })),
      input.shiftKey,
    )
    input.setMarquee(null)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}
