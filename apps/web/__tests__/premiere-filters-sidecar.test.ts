// @ts-nocheck
import { describe, expect, it } from 'vitest'
import { buildPremiereXmeml } from '@/lib/pipeline/export-premiere-xml'
import { extractPremiereFilterBlocks, sanitizePremiereFiltersXml } from '@/lib/pipeline/premiere-filters-xml'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('premiere filters xml sidecar', () => {
  it('extracts and sanitizes filter blocks', () => {
    const body = `<name>x</name><filter><effect><name>Opacity</name></effect></filter><filter><effect><name>Blur</name></effect></filter>`
    const extracted = extractPremiereFilterBlocks(body)
    expect(extracted).toContain('Opacity')
    expect(extracted).toContain('Blur')
    expect(sanitizePremiereFiltersXml('<script>x</script>')).toBeNull()
    expect(sanitizePremiereFiltersXml(extracted)).toContain('<filter')
  })

  it('re-injects filters into outbound XMEML', () => {
    const xml = buildPremiereXmeml({
      cut: { id: 'c1', name: 'FX', width: 1920, height: 1080, frameRate: 25 },
      scenes: [
        {
          id: 's1',
          mediaAssetId: '11111111-1111-1111-1111-111111111111',
          startMs: 0,
          endMs: 1000,
          originalFilename: 'a.mp4',
          zipMediaName: 'a.mp4',
          premiereFiltersXml: '<filter><effect><name>Opacity</name></effect></filter>',
        },
      ],
    })
    expect(xml).toContain('<filter>')
    expect(xml).toContain('Opacity')
  })

  it('wires restore + export + migration', () => {
    const route = readFileSync(join(__dirname, '../app/api/cuts/[cutId]/route.ts'), 'utf8')
    expect(route).toContain('premiereFiltersXml')
    expect(route).toContain('sanitizePremiereFiltersXml')
    const cuts = readFileSync(join(__dirname, '../lib/db/cuts.ts'), 'utf8')
    expect(cuts).toContain('premiere_filters_xml')
    const migration = readFileSync(
      join(__dirname, '../../../migrations/0018_cut_scenes_premiere_filters.sql'),
      'utf8',
    )
    expect(migration).toContain('premiere_filters_xml')
  })
})
