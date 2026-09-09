import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('cut timeline viewport gestures', () => {
  it('binds zoom/pan/alt-jog hook and does not steal plain wheel for jog', () => {
    const timeline = readFileSync(join(__dirname, '../components/cut-timeline.tsx'), 'utf8')
    const gestures = readFileSync(join(__dirname, '../lib/use-timeline-viewport-gestures.ts'), 'utf8')
    const css = readFileSync(join(__dirname, '../app/globals.css'), 'utf8')
    const spec = readFileSync(join(__dirname, '../../../specs/domain/videon-ui-surfaces.md'), 'utf8')

    expect(timeline).toMatch(/useTimelineViewportGestures/)
    expect(timeline).not.toMatch(/useJogShuttle/)
    expect(timeline).toMatch(/snapGuideMs/)
    expect(timeline).toMatch(/videon-cut-timeline__snap-guide/)
    expect(timeline).toMatch(/snapCutMsToPixels/)
    expect(timeline).toMatch(/buildCutSnapPoints/)

    expect(gestures).toMatch(/event\.altKey/)
    expect(gestures).toMatch(/ctrlKey \|\| event\.metaKey/)
    expect(gestures).toMatch(/scrollLeftAfterZoom/)
    expect(gestures).toMatch(/element\.scrollLeft \+= dx/)

    expect(css).toMatch(/\.videon-cut-timeline__snap-guide/)
    expect(spec).toMatch(/pixel.*threshold|pixel\*\* threshold/i)
    expect(spec).toMatch(/Alt\+wheel/)
  })
})
