export type TimelineWheelIntent = 'jog' | 'zoom' | 'pan-x' | 'scroll-y'

/** Classify Cut timeline wheel/trackpad intent (specs/domain/videon-ui-surfaces.md). */
export function classifyTimelineWheel(event: {
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  deltaX: number
  deltaY: number
}): TimelineWheelIntent {
  if (event.altKey) return 'jog'
  if (event.ctrlKey || event.metaKey) return 'zoom'
  if (event.shiftKey) return 'pan-x'
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return 'pan-x'
  return 'scroll-y'
}

/** Horizontal delta for pan-x: prefer deltaX; Shift+vertical maps to time pan. */
export function timelineWheelPanDelta(event: { shiftKey: boolean; deltaX: number; deltaY: number }): number {
  if (event.shiftKey && Math.abs(event.deltaX) < 0.5) return event.deltaY
  return event.deltaX || event.deltaY
}
