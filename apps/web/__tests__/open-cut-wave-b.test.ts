// @ts-nocheck
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  canvasLabel,
  formatUpdatedAt,
  nextPollDelayMs,
  normalizeCutsList,
  openCutCacheKey,
  openCutIdempotencyKey,
  OPEN_CUT_HANDOFF_BANNER,
  OPEN_CUT_PHASE_LABEL,
  pickReusablePremiereExport,
  pickXmlPathFromEntries,
  shouldReusePremiereExport,
} from '../../../tools/adobe-uxp-library-panel/src/open-cut-model.js'

describe('open-cut-model Wave B helpers', () => {
  it('labels canvas presets and formats updatedAt', () => {
    expect(canvasLabel({ width: 1920, height: 1080 })).toBe('16:9')
    expect(canvasLabel({ width: 1080, height: 1920 })).toBe('9:16')
    expect(canvasLabel({ width: 800, height: 600 })).toBe('800×600')
    expect(canvasLabel({})).toBe('—')
    const now = Date.parse('2026-09-10T12:00:00.000Z')
    expect(formatUpdatedAt('2026-09-10T11:30:00.000Z', now)).toBe('vor 30 Min.')
  })

  it('reuses premiere_xml only when export is fresh enough', () => {
    const cut = { id: 'c1', updatedAt: '2026-09-10T10:00:00.000Z' }
    expect(
      shouldReusePremiereExport(cut, {
        format: 'premiere_xml',
        status: 'succeeded',
        storageKey: 'ws/exports/a.zip',
        createdAt: '2026-09-10T11:00:00.000Z',
      }),
    ).toBe(true)
    expect(
      shouldReusePremiereExport(cut, {
        format: 'premiere_xml',
        status: 'succeeded',
        storageKey: 'ws/exports/a.zip',
        createdAt: '2026-09-10T09:00:00.000Z',
      }),
    ).toBe(false)
    expect(
      shouldReusePremiereExport(cut, {
        format: 'premiere_xml',
        status: 'succeeded',
        createdAt: '2026-09-10T11:00:00.000Z',
      }),
    ).toBe(false)
    expect(
      shouldReusePremiereExport(cut, {
        format: 'mp4',
        status: 'succeeded',
        storageKey: 'ws/exports/a.mp4',
        createdAt: '2026-09-10T11:00:00.000Z',
      }),
    ).toBe(false)
    expect(
      pickReusablePremiereExport(cut, [
        { format: 'mp4', status: 'succeeded', createdAt: '2026-09-10T12:00:00.000Z' },
        {
          id: 'e1',
          format: 'premiere_xml',
          status: 'succeeded',
          storageKey: 'ws/exports/e1.zip',
          createdAt: '2026-09-10T11:00:00.000Z',
        },
      ])?.id,
    ).toBe('e1')
  })

  it('detects missing storage key errors for retry', async () => {
    const { isMissingStorageKeyError } = await import(
      '../../../tools/adobe-uxp-library-panel/src/open-cut-model.js'
    )
    expect(isMissingStorageKeyError('The specified key does not exist')).toBe(true)
    expect(isMissingStorageKeyError('Export package missing in storage')).toBe(true)
    expect(isMissingStorageKeyError('network timeout')).toBe(false)
  })

  it('builds cache + idempotency keys and poll backoff', () => {
    expect(openCutIdempotencyKey({ id: 'c1', updatedAt: 't1' })).toBe('open-cut:c1:t1')
    expect(openCutCacheKey('c1', 'e1', 99)).toBe('c1:premiere_xml:e1:99')
    expect(nextPollDelayMs(0)).toBe(1000)
    expect(nextPollDelayMs(10)).toBe(5000)
    expect(OPEN_CUT_PHASE_LABEL.handoff).toBe('Bereit zum Import…')
    expect(OPEN_CUT_HANDOFF_BANNER).toContain('Importieren')
  })

  it('normalizes cuts list and picks xml path', () => {
    const items = normalizeCutsList({
      items: [
        { id: 'b', name: 'B', updatedAt: '2026-09-09T00:00:00.000Z' },
        { id: 'a', name: 'A', updatedAt: '2026-09-10T00:00:00.000Z', width: 1920, height: 1080 },
        { id: '', name: 'skip' },
      ],
    })
    expect(items).toHaveLength(2)
    expect(items[0].id).toBe('a')
    expect(pickXmlPathFromEntries(['media/a.mp4', 'Cut.xml', 'README.txt'])).toBe('Cut.xml')
    expect(pickXmlPathFromEntries(['nested/x.xml'])).toBe('nested/x.xml')
  })

  it('panel ships Wave B open-cut modules + fflate dependency', () => {
    const root = join(__dirname, '../../../tools/adobe-uxp-library-panel')
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    expect(pkg.dependencies.fflate).toMatch(/^[\^~]?0\.8\./)
    expect(readFileSync(join(root, 'src/open-cut.js'), 'utf8')).toContain('runOpenCut')
    expect(readFileSync(join(root, 'src/open-cut.js'), 'utf8')).toContain('forceFreshExport')
    expect(readFileSync(join(root, 'src/open-cut.js'), 'utf8')).toContain('isMissingStorageKeyError')
    expect(readFileSync(join(root, 'src/cuts-api.js'), 'utf8')).toContain('premiere_xml')
    expect(readFileSync(join(root, 'src/open-cut-cache.js'), 'utf8')).toContain('unzipSync')
    expect(readFileSync(join(root, 'src/premiere-open-cut.js'), 'utf8')).toContain('reveal_and_prompt')
    expect(readFileSync(join(root, 'src/premiere-open-cut.js'), 'utf8')).toContain('openCutInPremiere')
    expect(readFileSync(join(root, 'src/premiere-open-cut.js'), 'utf8')).toContain('autoImportOpenCutXml')
    expect(readFileSync(join(root, 'src/premiere-open-cut.js'), 'utf8')).toContain('replaceLinked')
    expect(readFileSync(join(root, 'src/premiere-open-cut.js'), 'utf8')).toContain('deleteSequenceBestEffort')
    expect(readFileSync(join(root, 'src/index.html'), 'utf8')).toContain('mode-cuts-btn')
    expect(readFileSync(join(root, 'src/index.html'), 'utf8')).toContain('Sequenz ersetzen')
    expect(readFileSync(join(root, 'src/index.js'), 'utf8')).toContain('In Premiere öffnen')
    expect(readFileSync(join(root, 'src/index.js'), 'utf8')).toContain('replaceLinked: true')
    expect(readFileSync(join(root, 'src/index.js'), 'utf8')).not.toContain(
      'withParityRefresh || preview.needsParityRefresh',
    )
    expect(readFileSync(join(root, 'src/index.js'), 'utf8')).toContain("PANEL_VERSION = '0.1.24'")
    expect(readFileSync(join(root, 'src/index.js'), 'utf8')).toContain('setPanelMode')
    expect(readFileSync(join(root, 'src/http.js'), 'utf8')).toContain('xhr.send(body)')
  })

  it('matches linked sequences by guid or name', async () => {
    const { sequenceMatchesLink, sequenceKey } = await import(
      '../../../tools/adobe-uxp-library-panel/src/premiere-open-cut.js'
    )
    expect(sequenceKey({ guid: 'g1', name: 'A' })).toBe('g1')
    expect(sequenceMatchesLink({ guid: 'g1', name: 'Other' }, { sequenceGuid: 'g1' })).toBe(true)
    expect(sequenceMatchesLink({ name: 'Sommer Final' }, { sequenceName: 'Sommer Final' })).toBe(true)
    expect(sequenceMatchesLink({ name: 'Sommer Final 2' }, { sequenceName: 'Sommer Final' })).toBe(
      true,
    )
    expect(sequenceMatchesLink({ name: 'Other' }, { sequenceName: 'Sommer Final' })).toBe(false)
  })
})
