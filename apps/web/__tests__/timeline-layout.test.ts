import { describe, expect, it } from 'vitest'
import {
  buildTimelineTicks,
  timelineContentWidthPx,
  timelineLeftPx,
  timelineMsPerPixel,
  timelineWidthPx,
} from '@/lib/timeline-layout'

describe('timeline layout', () => {
  it('maps milliseconds to proportional pixel widths', () => {
    const msPerPixel = timelineMsPerPixel(2)
    expect(timelineLeftPx(3000, msPerPixel)).toBe(250)
    expect(timelineWidthPx(1500, msPerPixel)).toBe(125)
  })

  it('builds ruler ticks aligned to pixel positions', () => {
    const ticks = buildTimelineTicks(10_000, 2)
    expect(ticks[0]).toMatchObject({ ms: 0, leftPx: 0, major: true })
    expect(ticks.at(-1)?.ms).toBeGreaterThanOrEqual(10_000)
  })

  it('expands content width when zooming in', () => {
    expect(timelineContentWidthPx(60_000, 4)).toBeGreaterThan(timelineContentWidthPx(60_000, 1))
  })

  it('shrinks content width when zooming out below 1×', () => {
    expect(timelineMsPerPixel(0.5)).toBeGreaterThan(timelineMsPerPixel(1))
    expect(timelineContentWidthPx(60_000, 0.5)).toBeLessThan(timelineContentWidthPx(60_000, 1))
  })
})
