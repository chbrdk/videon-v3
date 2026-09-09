import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('cut V2 video overlay wiring', () => {
  it('ships overlay track kind, API actions, and timeline lane', () => {
    const migration = readFileSync(
      join(__dirname, '../../../migrations/0016_cut_video_overlay.sql'),
      'utf8',
    )
    const route = readFileSync(join(__dirname, '../app/api/cuts/[cutId]/route.ts'), 'utf8')
    const timeline = readFileSync(join(__dirname, '../components/cut-timeline.tsx'), 'utf8')
    const view = readFileSync(join(__dirname, '../components/cut-editor-view.tsx'), 'utf8')
    const header = readFileSync(join(__dirname, '../components/timeline-track-header.tsx'), 'utf8')

    expect(migration).toMatch(/video_overlay/)
    expect(migration).toMatch(/cut_video_clips/)
    expect(route).toMatch(/addVideoClip/)
    expect(route).toMatch(/moveVideoClip/)
    expect(route).toMatch(/videoClips/)
    expect(timeline).toMatch(/onDropVideoOverlay/)
    expect(timeline).toMatch(/track--v2/)
    expect(view).toMatch(/action: 'addVideoClip'/)
    expect(header).toMatch(/v2:/)
  })
})
