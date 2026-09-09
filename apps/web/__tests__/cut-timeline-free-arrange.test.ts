import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('cut V1 timeline free arrange', () => {
  it('wires moveScene, edge resize, and drop-at-time', () => {
    const timeline = readFileSync(join(__dirname, '../components/cut-timeline.tsx'), 'utf8')
    const view = readFileSync(join(__dirname, '../components/cut-editor-view.tsx'), 'utf8')
    const route = readFileSync(join(__dirname, '../app/api/cuts/[cutId]/route.ts'), 'utf8')
    const css = readFileSync(join(__dirname, '../app/globals.css'), 'utf8')
    const migration = readFileSync(
      join(__dirname, '../../../migrations/0015_cut_scenes_timeline_start.sql'),
      'utf8',
    )

    expect(route).toMatch(/action === 'moveScene'/)
    expect(route).toMatch(/timelineStartMs/)
    expect(view).toMatch(/action: 'moveScene'/)
    expect(view).toMatch(/onMoveClip=/)
    expect(view).toMatch(/useState<TrimMode>\('ripple'\)/)
    expect(timeline).toMatch(/onMoveClip/)
    expect(timeline).toMatch(/timelineStartMs: cutMs/)
    expect(timeline).toMatch(/clip-handle--start/)
    expect(css).toMatch(/opacity: 0\.92/)
    expect(css).toMatch(/\.videon-cut-timeline__clip\.is-dragging/)
    expect(migration).toMatch(/timeline_start_ms/)
  })
})
