import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('cut bin mediathek cards', () => {
  it('ships CutBinPanel with search + two-column drill-down and sceneCount on browse list', () => {
    const panel = readFileSync(join(__dirname, '../components/cut-bin-panel.tsx'), 'utf8')
    const view = readFileSync(join(__dirname, '../components/cut-editor-view.tsx'), 'utf8')
    const mediaDb = readFileSync(join(__dirname, '../lib/db/media.ts'), 'utf8')
    const spec = readFileSync(join(__dirname, '../../../specs/domain/videon-ui-surfaces.md'), 'utf8')

    expect(panel).toMatch(/videon-cut-bin__grid/)
    expect(panel).toMatch(/Mediathek durchsuchen/)
    expect(panel).toMatch(/data-view="scenes"/)
    expect(panel).toMatch(/MediaCardThumb/)
    expect(view).toMatch(/CutBinPanel/)
    expect(view).not.toMatch(/Analyse-Szenen \(Mehrfachauswahl\)/)
    expect(mediaDb).toMatch(/sceneCount/)
    expect(mediaDb).toMatch(/LATEST_SCENE_COUNT_SQL/)
    expect(spec).toMatch(/two-column thumbnail card grid/)
  })
})
