// @ts-nocheck
import { describe, expect, it } from 'vitest'
import { buildPremiereXmeml } from '@/lib/pipeline/export-premiere-xml'
import {
  extractPremiereClipSidecar,
  extractPremiereFilterBlocks,
  extractPremiereSequenceExtras,
  extractPremiereTrackSidecar,
  sanitizePremiereClipSidecarXml,
} from '@/lib/pipeline/premiere-filters-xml'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('premiere NLE sidecars', () => {
  it('extracts residual clip extras beyond filters', () => {
    const body = `<name>x</name><enabled>TRUE</enabled><start>0</start><end>10</end><in>0</in><out>10</out>
      <file id="file-1"><name>a.mp4</name></file>
      <sourcetrack><mediatype>video</mediatype></sourcetrack>
      <filter><effect><name>Opacity</name></effect></filter>
      <labels><label2>Lavender</label2></labels>
      <comments>note</comments>`
    const sidecar = extractPremiereClipSidecar(body)
    expect(sidecar).toContain('Opacity')
    expect(sidecar).toContain('labels')
    expect(sidecar).toContain('comments')
    expect(sidecar).not.toContain('<file ')
    expect(extractPremiereFilterBlocks(body)).toContain('Opacity')
    expect(sanitizePremiereClipSidecarXml('<script>x</script>')).toBeNull()
  })

  it('extracts track transitions and sequence markers', () => {
    const track = `<name>V1</name><clipitem id="c1"><name>a</name></clipitem>
      <transitionitem><start>1</start><end>2</end></transitionitem>`
    expect(extractPremiereTrackSidecar(track)).toContain('transitionitem')
    const xml = `<sequence><name>S</name><rate><timebase>25</timebase></rate>
      <marker><comment>x</comment></marker><media><video></video></media></sequence>`
    expect(extractPremiereSequenceExtras(xml)).toContain('marker')
  })

  it('re-injects clip + track + sequence sidecars into outbound XMEML', () => {
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
      premiereV1TrackSidecarXml: '<transitionitem><start>1</start><end>2</end></transitionitem>',
      premiereSequenceExtrasXml: '<marker><comment>beat</comment></marker>',
    })
    expect(xml).toContain('Opacity')
    expect(xml).toContain('transitionitem')
    expect(xml).toContain('<marker>')
  })

  it('wires restore + migration 0019', () => {
    const route = readFileSync(join(__dirname, '../app/api/cuts/[cutId]/route.ts'), 'utf8')
    expect(route).toContain('premiereV1TrackSidecarXml')
    expect(route).toContain('premiereSequenceExtrasXml')
    const migration = readFileSync(
      join(__dirname, '../../../migrations/0019_cut_premiere_nle_sidecars.sql'),
      'utf8',
    )
    expect(migration).toContain('premiere_v1_track_sidecar_xml')
  })
})
