import { describe, expect, it } from 'vitest'
import {
  buildCutSnapPoints,
  scrollLeftAfterZoom,
  snapCutMsToPixels,
  CUT_SNAP_THRESHOLD_PX,
} from '@/lib/timeline-snap'

describe('buildCutSnapPoints', () => {
  it('merges V1, V2, and playhead edges', () => {
    const points = buildCutSnapPoints({
      v1: [{ cutStartMs: 0, cutEndMs: 1000 }],
      v2: [{ cutStartMs: 500, cutEndMs: 2000 }],
      playheadMs: 750,
    })
    expect(points).toEqual([0, 500, 750, 1000, 2000])
  })

  it('excludes the active clip edges', () => {
    const points = buildCutSnapPoints({
      v1: [
        { cutStartMs: 0, cutEndMs: 1000 },
        { cutStartMs: 2000, cutEndMs: 3000 },
      ],
      exclude: { cutStartMs: 0, cutEndMs: 1000 },
    })
    expect(points).toEqual([0, 2000, 3000])
    expect(points).not.toContain(1000)
  })
})

describe('snapCutMsToPixels', () => {
  it('uses a pixel threshold so snap distance scales with zoom', () => {
    const points = [1000]
    const loose = snapCutMsToPixels(1000 + 9 * 12, points, 12, CUT_SNAP_THRESHOLD_PX)
    expect(loose.snapped).toBe(true)
    expect(loose.ms).toBe(1000)
    expect(loose.guideMs).toBe(1000)

    const tight = snapCutMsToPixels(1000 + 9 * 2, points, 2, CUT_SNAP_THRESHOLD_PX)
    expect(tight.snapped).toBe(true)

    const miss = snapCutMsToPixels(1000 + 11 * 2, points, 2, CUT_SNAP_THRESHOLD_PX)
    expect(miss.snapped).toBe(false)
    expect(miss.guideMs).toBeNull()
    expect(miss.ms).toBe(1000 + 22)
  })
})

describe('scrollLeftAfterZoom', () => {
  it('keeps time under cursor stable after ms/px change', () => {
    const scrollLeft = scrollLeftAfterZoom({
      scrollLeft: 100,
      pointerOffsetX: 200,
      oldMsPerPixel: 12,
      newMsPerPixel: 6,
    })
    // time under cursor = (100+200)*12 = 3600ms; at 6ms/px → left = 3600/6 - 200 = 400
    expect(scrollLeft).toBe(400)
  })
})
