import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { classifyTimelineWheel, timelineWheelPanDelta } from '@/lib/timeline-wheel-intent'

describe('classifyTimelineWheel', () => {
  it('maps modifiers and axes to intents', () => {
    expect(
      classifyTimelineWheel({ altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, deltaX: 0, deltaY: 40 }),
    ).toBe('jog')
    expect(
      classifyTimelineWheel({ altKey: false, ctrlKey: true, metaKey: false, shiftKey: false, deltaX: 0, deltaY: 40 }),
    ).toBe('zoom')
    expect(
      classifyTimelineWheel({ altKey: false, ctrlKey: false, metaKey: false, shiftKey: true, deltaX: 0, deltaY: 40 }),
    ).toBe('pan-x')
    expect(
      classifyTimelineWheel({ altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, deltaX: 30, deltaY: 5 }),
    ).toBe('pan-x')
    expect(
      classifyTimelineWheel({ altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, deltaX: 0, deltaY: 40 }),
    ).toBe('scroll-y')
  })

  it('maps shift vertical wheel to horizontal pan delta', () => {
    expect(timelineWheelPanDelta({ shiftKey: true, deltaX: 0, deltaY: 20 })).toBe(20)
    expect(timelineWheelPanDelta({ shiftKey: false, deltaX: 12, deltaY: 3 })).toBe(12)
  })
})

describe('cut timeline edit UX smoke', () => {
  it('binds snap toggle, multi-select, fit, inertia, and trim precue', () => {
    const timeline = readFileSync(join(__dirname, '../components/cut-timeline.tsx'), 'utf8')
    const editor = readFileSync(join(__dirname, '../components/cut-editor-view.tsx'), 'utf8')
    const gestures = readFileSync(join(__dirname, '../lib/use-timeline-viewport-gestures.ts'), 'utf8')
    const keyboard = readFileSync(join(__dirname, '../lib/use-editor-keyboard.ts'), 'utf8')
    const css = readFileSync(join(__dirname, '../app/globals.css'), 'utf8')
    const spec = readFileSync(join(__dirname, '../../../specs/domain/cut-timeline-edit-ux.md'), 'utf8')

    expect(timeline).toMatch(/useTimelineViewportGestures/)
    expect(timeline).not.toMatch(/useJogShuttle/)
    expect(timeline).toMatch(/setSnapEnabled/)
    expect(timeline).toMatch(/fitSelection|fitAll/)
    expect(timeline).toMatch(/applyClipSelection/)
    expect(timeline).toMatch(/is-selected/)
    expect(timeline).toMatch(/onSeek\(Math\.max\(0, Math\.min\(edgeCutMs/)
    expect(timeline).toMatch(/audioClips\.map/)
    expect(timeline).toMatch(/onDoubleClick/)

    expect(gestures).toMatch(/nextInertiaVelocity|runInertia/)
    expect(gestures).toMatch(/event\.altKey|intent === 'jog'/)
    expect(gestures).toMatch(/scroll-y/)
    expect(gestures).toMatch(/classifyTimelineWheel/)

    expect(keyboard).toMatch(/key === 'n'/)
    expect(keyboard).toMatch(/onToggleSnap/)
    expect(keyboard).toMatch(/onFitSelection/)
    expect(keyboard).toMatch(/onNudgeLeft/)
    expect(keyboard).toMatch(/key === 's' && !meta/)

    expect(editor).toMatch(/onMarkIn/)
    expect(editor).toMatch(/nudgeSelectedClips/)
    expect(editor).toMatch(/timelineViewportApiRef/)

    expect(css).toMatch(/is-selected/)
    expect(css).toMatch(/videon-cut-timeline__mark/)
    expect(css).toMatch(/track--video/)
    expect(css).toMatch(/min-height: 0\.75rem/)
    expect(spec).toMatch(/Snap toggle MUST use/)
    expect(spec).toMatch(/plain vertical/)
  })
})
