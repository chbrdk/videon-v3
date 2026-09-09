import { describe, expect, it } from 'vitest'
import {
  applyCutSnap,
  buildCutSnapPoints,
  nudgeTimelineStartMs,
  scrollLeftAfterZoom,
  snapCutMsToPixels,
  CUT_SNAP_THRESHOLD_PX,
} from '@/lib/timeline-snap'
import { zoomIndexToFit, TIMELINE_ZOOM_LEVELS } from '@/lib/timeline-layout'
import { nextInertiaVelocity, applyInertiaScrollLeft } from '@/lib/timeline-pan-inertia'
import {
  rangeCutSelection,
  toggleCutSelection,
  type CutSelection,
} from '@/lib/cut-timeline-selection'

describe('buildCutSnapPoints extended', () => {
  it('includes audio, marks, sequence end, and multi-exclude', () => {
    const points = buildCutSnapPoints({
      v1: [{ cutStartMs: 0, cutEndMs: 1000 }],
      v2: [{ cutStartMs: 500, cutEndMs: 1500 }],
      audio: [{ cutStartMs: 200, cutEndMs: 400 }],
      playheadMs: 300,
      sequenceEndMs: 5000,
      marks: { inMs: 100, outMs: 900 },
      excludes: [{ cutStartMs: 0, cutEndMs: 1000 }],
    })
    expect(points).toContain(200)
    expect(points).toContain(400)
    expect(points).toContain(100)
    expect(points).toContain(900)
    expect(points).toContain(5000)
    expect(points).toContain(300)
    expect(points).not.toContain(1000)
  })
})

describe('applyCutSnap', () => {
  it('returns raw when snap disabled', () => {
    const result = applyCutSnap(1010, [1000], 12, false)
    expect(result.snapped).toBe(false)
    expect(result.ms).toBe(1010)
    expect(result.guideMs).toBeNull()
  })

  it('snaps when enabled', () => {
    const result = applyCutSnap(1000 + 9 * 12, [1000], 12, true, CUT_SNAP_THRESHOLD_PX)
    expect(result.snapped).toBe(true)
    expect(result.ms).toBe(1000)
  })
})

describe('zoomIndexToFit', () => {
  it('picks the largest zoom that fits the span', () => {
    // At 0.25x: msPerPixel = 96 → 96000ms ≈ 1000px
    const index = zoomIndexToFit(96_000, 1000)
    expect(index).toBeGreaterThanOrEqual(0)
    expect(index).toBeLessThan(TIMELINE_ZOOM_LEVELS.length)
    const tighter = zoomIndexToFit(1000, 2000)
    expect(tighter).toBeGreaterThanOrEqual(index)
  })
})

describe('pan inertia', () => {
  it('decays velocity to zero', () => {
    let v = 10
    for (let i = 0; i < 80; i += 1) v = nextInertiaVelocity(v)
    expect(v).toBe(0)
    expect(applyInertiaScrollLeft(100, 5)).toBe(105)
  })
})

describe('nudgeTimelineStartMs', () => {
  it('clamps at zero', () => {
    expect(nudgeTimelineStartMs(40, -100)).toBe(0)
    expect(nudgeTimelineStartMs(1000, 40)).toBe(1040)
  })
})

describe('cut selection', () => {
  it('toggles and ranges on a lane', () => {
    const a: CutSelection = { lane: 'v1', id: 'a' }
    const b: CutSelection = { lane: 'v1', id: 'b' }
    expect(toggleCutSelection([], a)).toEqual([a])
    expect(toggleCutSelection([a], a)).toEqual([])
    const range = rangeCutSelection(
      [
        { id: 'a', cutStartMs: 0, cutEndMs: 100 },
        { id: 'b', cutStartMs: 100, cutEndMs: 200 },
        { id: 'c', cutStartMs: 200, cutEndMs: 300 },
      ],
      'a',
      'c',
      'v1',
    )
    expect(range.map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(toggleCutSelection([a, b], a).map((item) => item.id)).toEqual(['b'])
  })
})

describe('scrollLeftAfterZoom', () => {
  it('keeps time under cursor stable', () => {
    expect(
      scrollLeftAfterZoom({
        scrollLeft: 100,
        pointerOffsetX: 200,
        oldMsPerPixel: 12,
        newMsPerPixel: 6,
      }),
    ).toBe(400)
  })
})

describe('snapCutMsToPixels pixel threshold', () => {
  it('misses outside threshold', () => {
    const miss = snapCutMsToPixels(1000 + 11 * 2, [1000], 2, CUT_SNAP_THRESHOLD_PX)
    expect(miss.snapped).toBe(false)
  })
})
