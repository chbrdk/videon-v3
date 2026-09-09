import { describe, expect, it } from 'vitest'
import { expandGroupMoveWithRipple, rippleCloseGapAfterDelete, rippleShiftLaterClips } from '@/lib/timeline-ripple'
import { marqueeHitClipIds, normalizeMarqueeRect } from '@/lib/timeline-marquee'
import { clipIntersectsView, viewportTimeRange } from '@/lib/timeline-viewport-cull'
import { downsamplePeaks } from '@/lib/waveform-lod'
import { buildCutSnapPoints, nextSnapFilter } from '@/lib/timeline-snap'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('timeline ripple', () => {
  it('shifts later clips by delta', () => {
    const moves = rippleShiftLaterClips(
      [
        { id: 'a', timelineStartMs: 0, durationMs: 1000 },
        { id: 'b', timelineStartMs: 1000, durationMs: 500 },
        { id: 'c', timelineStartMs: 2000, durationMs: 500 },
      ],
      { id: 'a', originStartMs: 0, newStartMs: 200, durationMs: 1000 },
    )
    expect(moves.find((move) => move.id === 'b')?.timelineStartMs).toBe(1200)
    expect(moves.find((move) => move.id === 'c')?.timelineStartMs).toBe(2200)
  })

  it('closes gap after delete', () => {
    const moves = rippleCloseGapAfterDelete(
      [
        { id: 'a', timelineStartMs: 0, durationMs: 1000 },
        { id: 'b', timelineStartMs: 1000, durationMs: 500 },
      ],
      { id: 'a', timelineStartMs: 0, durationMs: 1000 },
    )
    expect(moves).toEqual([{ id: 'b', timelineStartMs: 0 }])
  })

  it('expands group move with ripple', () => {
    const moves = expandGroupMoveWithRipple(
      [
        { id: 'a', timelineStartMs: 0, durationMs: 100 },
        { id: 'b', timelineStartMs: 200, durationMs: 100 },
      ],
      [{ id: 'a', originStartMs: 0, newStartMs: 50 }],
    )
    expect(moves.find((move) => move.id === 'b')?.timelineStartMs).toBe(250)
  })
})

describe('marquee + cull + lod + snap filter', () => {
  it('hits intersecting clips', () => {
    const rect = normalizeMarqueeRect({ x: 0, y: 0 }, { x: 50, y: 20 })
    expect(
      marqueeHitClipIds(rect, [
        { id: 'a', left: 10, top: 0, right: 40, bottom: 20 },
        { id: 'b', left: 60, top: 0, right: 80, bottom: 20 },
      ]),
    ).toEqual(['a'])
  })

  it('computes viewport range and cull', () => {
    const view = viewportTimeRange({ scrollLeft: 100, clientWidth: 200, msPerPixel: 10, padMs: 0 })
    expect(view.startMs).toBe(1000)
    expect(view.endMs).toBe(3000)
    expect(clipIntersectsView({ cutStartMs: 2900, cutEndMs: 3100 }, view)).toBe(true)
    expect(clipIntersectsView({ cutStartMs: 4000, cutEndMs: 4100 }, view)).toBe(false)
  })

  it('downsamples peaks and cycles snap filter', () => {
    expect(downsamplePeaks([1, 2, 3, 4, 5, 6], 2).length).toBe(2)
    expect(nextSnapFilter('all')).toBe('clips')
    expect(buildCutSnapPoints({ v1: [{ cutStartMs: 0, cutEndMs: 10 }], playheadMs: 5, filter: 'playhead' })).toEqual([
      0, 5,
    ])
  })
})

describe('wave2 smoke', () => {
  it('binds hotkeys, moveClips, minimap, and keeps L as shuttle', () => {
    const keyboard = readFileSync(join(__dirname, '../lib/use-editor-keyboard.ts'), 'utf8')
    const route = readFileSync(join(__dirname, '../app/api/cuts/[cutId]/route.ts'), 'utf8')
    const timeline = readFileSync(join(__dirname, '../components/cut-timeline.tsx'), 'utf8')
    const editor = readFileSync(join(__dirname, '../components/cut-editor-view.tsx'), 'utf8')
    const spec = readFileSync(join(__dirname, '../../../specs/domain/cut-timeline-edit-ux-wave2.md'), 'utf8')

    expect(keyboard).toMatch(/onToggleRipple/)
    expect(keyboard).toMatch(/onToolTrim/)
    expect(keyboard).toMatch(/onCycleSnapFilter/)
    expect(keyboard).toMatch(/key === 'l' && event\.shiftKey/)
    expect(keyboard).toMatch(/onShuttleHold/)
    expect(route).toMatch(/moveClips/)
    expect(timeline).toMatch(/CutTimelineMinimap/)
    expect(timeline).toMatch(/is-link-highlight/)
    expect(editor).toMatch(/⇧N|Shift\+N|Snap-Filter/)
    expect(editor).toMatch(/⇧L|Lock/)
    expect(spec).toMatch(/Shift\+L/)
  })
})
