// @ts-nocheck
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildPremiereXmeml } from '@/lib/pipeline/export-premiere-xml'
import {
  buildMediaCatalogFromCutDetail,
  buildMediaCatalogFromMediaList,
  diffV1Timelines,
  extractFileRegistry,
  formatEffectsLossWarning,
  formatPushbackDiffMessage,
  mapClipsToMedia,
  mappedClipsToRestoreScenes,
  mediaAssetIdFromFileId,
  mergePushbackMediaCatalog,
  normalizeCutDetailScenes,
  parsePremiereTimelineXml,
  pathBasenameFromUrl,
} from '../../../tools/adobe-uxp-library-panel/src/xmeml-pushback.js'

const FIXTURE_XML = buildPremiereXmeml({
  cut: { id: 'c1', name: 'Demo Cut', width: 1920, height: 1080, frameRate: 25 },
  scenes: [
    {
      id: 's1',
      mediaAssetId: '11111111-1111-1111-1111-111111111111',
      startMs: 0,
      endMs: 2000,
      originalFilename: 'a.mp4',
      zipMediaName: 'a.mp4',
    },
    {
      id: 's2',
      mediaAssetId: '22222222-2222-2222-2222-222222222222',
      startMs: 500,
      endMs: 2500,
      originalFilename: 'b.mp4',
      zipMediaName: 'b.mp4',
      timelineStartMs: 2000,
    },
  ],
})

/** Premiere-style re-export: numeric file ids + pathurl only on first full def. */
const PREMIERE_REEXPORT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <sequence>
    <name>Demo Cut</name>
    <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
    <media>
      <video>
        <track>
          <clipitem id="clipitem-1">
            <name>a.mp4</name>
            <enabled>TRUE</enabled>
            <start>0</start>
            <end>50</end>
            <in>0</in>
            <out>50</out>
            <file id="file-1">
              <name>a.mp4</name>
              <pathurl>file://localhost/Users/me/open-cut/media/a.mp4</pathurl>
            </file>
            <sourcetrack>
              <mediatype>video</mediatype>
              <trackindex>1</trackindex>
            </sourcetrack>
          </clipitem>
          <clipitem id="clipitem-2">
            <name>b.mp4</name>
            <enabled>TRUE</enabled>
            <start>50</start>
            <end>100</end>
            <in>12</in>
            <out>62</out>
            <file id="file-2"/>
            <sourcetrack>
              <mediatype>video</mediatype>
              <trackindex>1</trackindex>
            </sourcetrack>
          </clipitem>
        </track>
      </video>
      <audio>
        <track premiereTrackType="Stereo">
          <clipitem id="clipitem-3">
            <name>a.mp4</name>
            <start>0</start>
            <end>50</end>
            <in>0</in>
            <out>50</out>
            <file id="file-1"/>
            <sourcetrack>
              <mediatype>audio</mediatype>
              <trackindex>1</trackindex>
            </sourcetrack>
          </clipitem>
        </track>
      </audio>
    </media>
  </sequence>
  <bin>
    <children>
      <file id="file-2">
        <name>b.mp4</name>
        <pathurl>file://localhost/Users/me/open-cut/media/b.mp4</pathurl>
      </file>
    </children>
  </bin>
</xmeml>
`

describe('xmeml pushback parser', () => {
  it('parses V1 clips and file- media ids from outbound XMEML', () => {
    const parsed = parsePremiereTimelineXml(FIXTURE_XML)
    expect(parsed.fps).toBe(25)
    expect(parsed.trackName).toBe('V1')
    expect(parsed.v1).toHaveLength(2)
    expect(parsed.v1[0].mediaAssetId).toBe('11111111-1111-1111-1111-111111111111')
    expect(parsed.v1[0].startMs).toBe(0)
    expect(parsed.v1[0].endMs).toBe(2000)
    expect(parsed.v1[0].timelineStartMs).toBe(0)
    expect(parsed.v1[1].mediaAssetId).toBe('22222222-2222-2222-2222-222222222222')
    expect(parsed.v1[1].timelineStartMs).toBe(2000)
    expect(pathBasenameFromUrl('file://media/a.mp4')).toBe('a.mp4')
  })

  it('resolves Premiere re-export file-1 refs via registry + filename catalog', () => {
    expect(mediaAssetIdFromFileId('file-1')).toBeNull()
    expect(mediaAssetIdFromFileId('file-11111111-1111-1111-1111-111111111111')).toBe(
      '11111111-1111-1111-1111-111111111111',
    )
    const registry = extractFileRegistry(PREMIERE_REEXPORT_XML)
    expect(registry['file-1']?.filename).toBe('a.mp4')
    expect(registry['file-2']?.filename).toBe('b.mp4')

    const parsed = parsePremiereTimelineXml(PREMIERE_REEXPORT_XML)
    expect(parsed.v1).toHaveLength(2)
    expect(parsed.v1[0].mediaAssetId).toBeNull()
    expect(parsed.v1[0].filename).toBe('a.mp4')
    expect(parsed.v1[1].filename).toBe('b.mp4')

    const detail = {
      clips: [
        {
          scene: {
            id: 's1',
            mediaAssetId: '11111111-1111-1111-1111-111111111111',
            startMs: 0,
            endMs: 2000,
            timelineStartMs: 0,
          },
          media: { id: '11111111-1111-1111-1111-111111111111', originalFilename: 'a.mp4' },
        },
        {
          scene: {
            id: 's2',
            mediaAssetId: '22222222-2222-2222-2222-222222222222',
            startMs: 500,
            endMs: 2500,
            timelineStartMs: 2000,
          },
          media: { id: '22222222-2222-2222-2222-222222222222', originalFilename: 'b.mp4' },
        },
      ],
    }
    const catalog = buildMediaCatalogFromCutDetail(detail)
    const { mapped, unmapped } = mapClipsToMedia(parsed.v1, catalog)
    expect(unmapped).toHaveLength(0)
    expect(mapped).toHaveLength(2)
    expect(mapped[0].mapVia).toBe('filename')
    expect(mapped[0].mediaAssetId).toBe('11111111-1111-1111-1111-111111111111')
    expect(mapped[1].mediaAssetId).toBe('22222222-2222-2222-2222-222222222222')
  })

  it('maps clips and diffs against cut detail clips shape', () => {
    const detail = {
      clips: [
        {
          scene: {
            id: 's1',
            mediaAssetId: '11111111-1111-1111-1111-111111111111',
            startMs: 0,
            endMs: 2000,
            timelineStartMs: 0,
          },
          media: { id: '11111111-1111-1111-1111-111111111111', originalFilename: 'a.mp4' },
        },
        {
          scene: {
            id: 's2',
            mediaAssetId: '22222222-2222-2222-2222-222222222222',
            startMs: 500,
            endMs: 1500,
            timelineStartMs: 2000,
          },
          media: { id: '22222222-2222-2222-2222-222222222222', originalFilename: 'b.mp4' },
        },
      ],
    }
    const catalog = buildMediaCatalogFromCutDetail(detail)
    const parsed = parsePremiereTimelineXml(FIXTURE_XML)
    const { mapped, unmapped } = mapClipsToMedia(parsed.v1, catalog)
    expect(unmapped).toHaveLength(0)
    expect(mapped).toHaveLength(2)
    const scenes = normalizeCutDetailScenes(detail)
    const diff = diffV1Timelines(scenes, mapped)
    expect(diff.changed).toBe(true)
    expect(diff.summary).toContain('V1:')
    const restore = mappedClipsToRestoreScenes(mapped, () => '11111111-1111-4111-8111-111111111111')
    expect(restore.scenes[0]).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      mediaAssetId: '11111111-1111-1111-1111-111111111111',
      startMs: 0,
      endMs: 2000,
    })
    expect(restore.clampedCount).toBe(0)
  })

  it('clamps short clips to 500ms and emits UUID scene ids', () => {
    const { scenes, clampedCount } = mappedClipsToRestoreScenes(
      [{ mediaAssetId: '11111111-1111-1111-1111-111111111111', startMs: 0, endMs: 200, timelineStartMs: 0 }],
    )
    expect(clampedCount).toBe(1)
    expect(scenes[0].endMs - scenes[0].startMs).toBe(500)
    expect(scenes[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
  })

  it('panel ships pushback modules in 0.1.26', () => {
    const root = join(__dirname, '../../../tools/adobe-uxp-library-panel')
    expect(readFileSync(join(root, 'src/cut-pushback.js'), 'utf8')).toContain('previewCutPushback')
    expect(readFileSync(join(root, 'src/cut-pushback.js'), 'utf8')).toContain('mergePushbackMediaCatalog')
    expect(readFileSync(join(root, 'src/premiere-capture.js'), 'utf8')).toContain(
      'exportAsFinalCutProXML',
    )
    expect(readFileSync(join(root, 'src/xmeml-pushback.js'), 'utf8')).toContain('MIN_PUSHBACK_CLIP_MS')
    expect(readFileSync(join(root, 'src/xmeml-pushback.js'), 'utf8')).toContain('ticksToMs')
    expect(readFileSync(join(root, 'src/xmeml-pushback.js'), 'utf8')).toContain('mergePushbackMediaCatalog')
    expect(readFileSync(join(root, 'src/xmeml-pushback.js'), 'utf8')).toContain('formatEffectsLossWarning')
    expect(readFileSync(join(root, 'src/index.js'), 'utf8')).toContain('Cut aktualisieren')
    expect(readFileSync(join(root, 'src/index.js'), 'utf8')).toContain('confirmPushback')
    expect(readFileSync(join(root, 'src/index.js'), 'utf8')).toContain('withSequenceReplace')
    expect(readFileSync(join(root, 'src/index.js'), 'utf8')).toContain("PANEL_VERSION = '0.1.26'")
    expect(readFileSync(join(root, 'src/index.js'), 'utf8')).toContain('Wave P3')
    expect(readFileSync(join(root, 'src/index.html'), 'utf8')).toContain('pushback-confirm')
    expect(readFileSync(join(root, 'src/index.html'), 'utf8')).toContain('Sequenz ersetzen')
    expect(readFileSync(join(root, 'src/index.html'), 'utf8')).toContain('Wave P3')
  })

  it('warns when effects or transitions would be dropped', () => {
    expect(formatEffectsLossWarning(['effects'])).toMatch(/Effekte/)
    expect(formatEffectsLossWarning(['transitions'])).toMatch(/Transitions/)
    expect(formatEffectsLossWarning(['effects', 'transitions'])).toMatch(/Wave P3/)
    expect(formatEffectsLossWarning([])).toBe('')
    const msg = formatPushbackDiffMessage(
      { summary: 'V1: 1 → 1 Clips · 1 geändert' },
      ['effects'],
      0,
      0,
    )
    expect(msg).toContain('Ignoriert: effects')
    expect(msg).toContain('Wave P3')
  })

  it('prefers Cut media over Mediathek duplicates for the same filename', () => {
    const cutCatalog = buildMediaCatalogFromCutDetail({
      clips: [
        {
          scene: {
            id: 's1',
            mediaAssetId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            startMs: 0,
            endMs: 1000,
          },
          media: {
            id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            originalFilename: 'fin 1.mp4',
          },
        },
      ],
    })
    const listCatalog = buildMediaCatalogFromMediaList([
      { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', originalFilename: 'fin 1.mp4' },
      { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', originalFilename: 'fin 1.mp4' },
    ])
    const merged = mergePushbackMediaCatalog(cutCatalog, listCatalog)
    expect(merged.byFilename['fin 1.mp4']).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  })
  it('parses pproTicks when in/out are -1', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <sequence>
    <name>Ticks Cut</name>
    <rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>
    <media>
      <video>
        <track>
          <clipitem id="clipitem-1">
            <name>a.mp4</name>
            <enabled>TRUE</enabled>
            <start>0</start>
            <end>50</end>
            <in>-1</in>
            <out>-1</out>
            <pproTicksIn>0</pproTicksIn>
            <pproTicksOut>508032000000</pproTicksOut>
            <file id="file-11111111-1111-1111-1111-111111111111">
              <name>a.mp4</name>
              <pathurl>file://localhost/a.mp4</pathurl>
            </file>
            <sourcetrack><mediatype>video</mediatype><trackindex>1</trackindex></sourcetrack>
          </clipitem>
        </track>
      </video>
    </media>
  </sequence>
</xmeml>`
    const parsed = parsePremiereTimelineXml(xml)
    expect(parsed.v1).toHaveLength(1)
    expect(parsed.v1[0].startMs).toBe(0)
    expect(parsed.v1[0].endMs).toBe(2000)
    expect(parsed.v1[0].timelineStartMs).toBe(0)
  })
})
