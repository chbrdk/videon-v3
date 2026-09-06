import { formatClock } from '@/lib/editor-time'

export const TIMELINE_MS_PER_PIXEL_BASE = 24

/** Includes zoom-out below 1× so long sequences fit the viewport. */
export const TIMELINE_ZOOM_LEVELS = [0.25, 0.5, 1, 2, 4, 8] as const
export type TimelineZoomLevel = (typeof TIMELINE_ZOOM_LEVELS)[number]

export function defaultTimelineZoomIndex(): number {
  const index = TIMELINE_ZOOM_LEVELS.indexOf(1)
  return index >= 0 ? index : 0
}

export type TimelineTick = {
  ms: number
  leftPx: number
  major: boolean
  label: string | null
}

export function timelineMsPerPixel(zoomLevel: number): number {
  return TIMELINE_MS_PER_PIXEL_BASE / Math.max(zoomLevel, 0.05)
}

export function timelineContentWidthPx(totalDurationMs: number, zoomLevel: number, minWidthPx = 640): number {
  if (totalDurationMs <= 0) return minWidthPx
  const msPerPixel = timelineMsPerPixel(zoomLevel)
  return Math.max(Math.ceil(totalDurationMs / msPerPixel), minWidthPx)
}

export function timelineLeftPx(ms: number, msPerPixel: number): number {
  return ms / msPerPixel
}

export function timelineWidthPx(durationMs: number, msPerPixel: number, minPx = 2): number {
  if (durationMs <= 0) return minPx
  return Math.max(durationMs / msPerPixel, minPx)
}

export function timelineRulerStepMs(totalDurationMs: number, zoomLevel: number): number {
  if (zoomLevel < 1) {
    if (totalDurationMs <= 120_000) return 15_000
    if (totalDurationMs <= 600_000) return 60_000
    return 120_000
  }
  if (totalDurationMs <= 30_000) return zoomLevel >= 4 ? 1000 : 2000
  if (totalDurationMs <= 120_000) return zoomLevel >= 4 ? 5000 : 10_000
  if (totalDurationMs <= 600_000) return zoomLevel >= 4 ? 15_000 : 30_000
  return zoomLevel >= 4 ? 60_000 : 120_000
}

export function buildTimelineTicks(
  totalDurationMs: number,
  zoomLevel: number,
): TimelineTick[] {
  if (totalDurationMs <= 0) return []
  const msPerPixel = timelineMsPerPixel(zoomLevel)
  const stepMs = timelineRulerStepMs(totalDurationMs, zoomLevel)
  const majorEvery = 2
  const ticks: TimelineTick[] = []
  for (let ms = 0; ms <= totalDurationMs; ms += stepMs) {
    const major = ms % (stepMs * majorEvery) === 0
    ticks.push({
      ms,
      leftPx: timelineLeftPx(ms, msPerPixel),
      major,
      label: major ? formatClock(ms) : null,
    })
  }
  return ticks
}
