import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('generation target cut wiring', () => {
  it('migration adds target_cut_id columns', () => {
    const sql = readFileSync(
      join(process.cwd(), '../../migrations/0022_media_generation_target_cut.sql'),
      'utf8',
    )
    expect(sql).toMatch(/target_cut_id/)
    expect(sql).toMatch(/target_cut_inserted_at/)
  })

  it('db layer maps target cut + list-by-cut helper', () => {
    const db = readFileSync(join(process.cwd(), 'lib/db/media-generation.ts'), 'utf8')
    expect(db).toMatch(/targetCutId/)
    expect(db).toMatch(/listMediaGenerationJobsForTargetCut/)
    expect(db).toMatch(/markMediaGenerationCutInserted/)
  })

  it('worker and promote use append helper', () => {
    const run = readFileSync(join(process.cwd(), 'lib/pipeline/run-generate.ts'), 'utf8')
    const promote = readFileSync(
      join(process.cwd(), 'app/api/media/[mediaAssetId]/generate/[jobId]/promote/route.ts'),
      'utf8',
    )
    const helper = readFileSync(join(process.cwd(), 'lib/pipeline/append-promoted-to-cut.ts'), 'utf8')
    expect(helper).toMatch(/appendPromotedGenerationToCut/)
    expect(run).toMatch(/maybeInsertTargetCut/)
    expect(promote).toMatch(/appendPromotedGenerationToCut/)
  })

  it('cut editor polls generate-jobs and media editor can insert', () => {
    const cut = readFileSync(join(process.cwd(), 'components/cut-editor-view.tsx'), 'utf8')
    const media = readFileSync(join(process.cwd(), 'components/media-editor-view.tsx'), 'utf8')
    const pathsSrc = readFileSync(join(process.cwd(), 'lib/paths.ts'), 'utf8')
    expect(pathsSrc).toMatch(/apiCutGenerateJobs/)
    expect(cut).toMatch(/apiCutGenerateJobs/)
    expect(cut).toMatch(/approveCutAiEdit/)
    expect(media).toMatch(/insertAiEditIntoCut/)
    expect(media).toMatch(/cutId: activeCut\.cutId/)
  })
})
