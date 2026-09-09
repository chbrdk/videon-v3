import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('cut V1↔V2 lane move', () => {
  it('ships moveClipLane API, DB helpers, and timeline drop wiring', () => {
    const route = readFileSync(join(__dirname, '../app/api/cuts/[cutId]/route.ts'), 'utf8')
    const laneMove = readFileSync(join(__dirname, '../lib/db/cut-lane-move.ts'), 'utf8')
    const timeline = readFileSync(join(__dirname, '../components/cut-timeline.tsx'), 'utf8')
    const view = readFileSync(join(__dirname, '../components/cut-editor-view.tsx'), 'utf8')
    const apiSpec = readFileSync(join(__dirname, '../../../specs/api/cuts.md'), 'utf8')

    expect(route).toMatch(/moveClipLane/)
    expect(route).toMatch(/moveSceneToVideoOverlay/)
    expect(route).toMatch(/moveVideoOverlayToScene/)
    expect(laneMove).toMatch(/export async function moveSceneToVideoOverlay/)
    expect(laneMove).toMatch(/export async function moveVideoOverlayToScene/)
    expect(laneMove).toMatch(/scenes\.length <= 1/)
    expect(timeline).toMatch(/onMoveClipLane/)
    expect(timeline).toMatch(/videoLaneAtClientY/)
    expect(timeline).toMatch(/videoOverlayTrackRef/)
    expect(view).toMatch(/action: 'moveClipLane'/)
    expect(apiSpec).toMatch(/moveClipLane/)
  })
})
