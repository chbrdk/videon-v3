import { describe, expect, it } from 'vitest'
import {
  buildTimelineContextMenuDraft,
  clampContextMenuPosition,
  timelineMsFromClientX,
} from '@/lib/timeline-context-menu'

describe('buildTimelineContextMenuDraft', () => {
  it('builds scene actions with roadmap rows disabled', () => {
    const items = buildTimelineContextMenuDraft({
      kind: 'scene',
      sceneKey: 's0',
      startMs: 0,
      endMs: 1000,
    })
    expect(items.find((item) => item.id === 'open-scene-inspect')?.disabled).toBeUndefined()
    expect(items.find((item) => item.id === 'export-scene')?.disabled).toBe(true)
    expect(items.find((item) => item.id === 'add-comment')?.disabled).toBe(true)
    expect(items.some((item) => item.section)).toBe(true)
  })

  it('builds lane mark clear only when marks exist', () => {
    const without = buildTimelineContextMenuDraft({ kind: 'lane', atMs: 500 }, { hasMarks: false })
    expect(without.find((item) => item.id === 'clear-marks')).toBeUndefined()
    const withMarks = buildTimelineContextMenuDraft({ kind: 'lane', atMs: 500 }, { hasMarks: true })
    expect(withMarks.find((item) => item.id === 'clear-marks')?.danger).toBe(true)
  })

  it('builds transcript seek + open', () => {
    const items = buildTimelineContextMenuDraft({
      kind: 'transcript',
      startMs: 10,
      endMs: 20,
      index: 0,
    })
    expect(items.map((item) => item.id)).toEqual([
      'section-tx',
      'seek-transcript',
      'open-transcript',
    ])
  })
})

describe('clampContextMenuPosition', () => {
  it('keeps the menu inside the viewport inset', () => {
    expect(clampContextMenuPosition(0, 0, { width: 800, height: 600 })).toEqual({ x: 8, y: 8 })
    expect(clampContextMenuPosition(900, 700, { width: 800, height: 600 })).toEqual({
      x: 800 - 220 - 8,
      y: 600 - 280 - 8,
    })
  })
})

describe('timelineMsFromClientX', () => {
  it('maps pointer x into clamped timeline ms', () => {
    expect(
      timelineMsFromClientX({
        clientX: 110,
        lanesLeft: 100,
        contentWidthPx: 100,
        msPerPixel: 10,
        durationMs: 5000,
      }),
    ).toBe(100)
  })
})
