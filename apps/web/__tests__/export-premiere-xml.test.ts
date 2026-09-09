import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assignPremiereZipMediaNames,
  buildPremiereXmeml,
  sanitizePremiereXmlFilename,
} from '@/lib/pipeline/export-premiere-xml'
import { writePremiereExportZip } from '@/lib/pipeline/export-premiere-zip'

describe('buildPremiereXmeml', () => {
  it('emits xmeml with cut canvas size and zip media paths', () => {
    const xml = buildPremiereXmeml({
      cut: {
        id: 'cut-1',
        name: 'Test Cut',
        width: 1080,
        height: 1920,
        frameRate: 25,
      },
      scenes: [
        {
          id: 's1',
          mediaAssetId: 'm1',
          startMs: 0,
          endMs: 2000,
          originalFilename: 'clip-a.mp4',
          zipMediaName: 'clip-a.mp4',
          mediaDurationMs: 10000,
        },
        {
          id: 's2',
          mediaAssetId: 'm2',
          startMs: 500,
          endMs: 1500,
          originalFilename: 'clip-b.mp4',
          zipMediaName: 'clip-b.mp4',
          mediaDurationMs: 8000,
        },
      ],
    })

    expect(xml).toContain('<xmeml version="5">')
    expect(xml).toContain('<width>1080</width>')
    expect(xml).toContain('<height>1920</height>')
    expect(xml).toContain('<timebase>25</timebase>')
    expect(xml).toContain('file://media/clip-a.mp4')
    expect(xml).toContain('Test Cut')
    expect(xml).toContain('premiereTrackType="Stereo"')
    expect(xml).toContain('currentExplodedTrackIndex="1"')
    expect(xml).not.toContain('pproTicksIn')
    // Audio L for scene 2 (n=2 → firstAudioId=3 → clipitem-4), in=13 @ 500ms/25fps
    expect(xml).toMatch(/<clipitem id="clipitem-4"[\s\S]*?<in>13<\/in>/)
    expect(xml).toMatch(/<clipitem id="clipitem-4"[\s\S]*?<out>38<\/out>/)
  })

  it('keeps matching in/out on video and both audio channels', () => {
    const xml = buildPremiereXmeml({
      cut: { id: 'c', name: 'C', width: 1920, height: 1080, frameRate: 25 },
      scenes: [
        {
          id: 's1',
          mediaAssetId: 'm1',
          startMs: 15_480, // 15:12 @ 25fps → 387 frames
          endMs: 16_480,
          originalFilename: 'fin 1.mp4',
          zipMediaName: 'fin 1.mp4',
        },
      ],
    })
    const inMatches = [...xml.matchAll(/<in>(\d+)<\/in>/g)].map((m) => m[1])
    const outMatches = [...xml.matchAll(/<out>(\d+)<\/out>/g)].map((m) => m[1])
    expect(inMatches).toEqual(['387', '387', '387'])
    expect(outMatches).toEqual(['412', '412', '412'])
  })
})

describe('assignPremiereZipMediaNames', () => {
  it('disambiguates colliding original filenames', () => {
    const names = assignPremiereZipMediaNames([
      { mediaAssetId: 'a', originalFilename: 'fin 1.mp4' },
      { mediaAssetId: 'b', originalFilename: 'fin 1.mp4' },
      { mediaAssetId: 'a', originalFilename: 'fin 1.mp4' },
    ])
    expect(names.get('a')).toBe('fin 1.mp4')
    expect(names.get('b')).toBe('fin 1-2.mp4')
  })
})

describe('sanitizePremiereXmlFilename', () => {
  it('returns a safe xml basename', () => {
    expect(sanitizePremiereXmlFilename('My Cut / Final')).toBe('My Cut _ Final.xml')
  })
})

describe('writePremiereExportZip', () => {
  it('writes zip containing xml and media entries', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'videon-premiere-zip-'))
    const mediaPath = join(dir, 'source.mp4')
    const zipPath = join(dir, 'out.zip')
    await writeFile(mediaPath, Buffer.from('fake-video'), 'utf8')

    await writePremiereExportZip({
      zipPath,
      xmlFilename: 'Cut.xml',
      xmlContent: '<xmeml version="4"></xmeml>',
      readmeContent: 'readme',
      mediaFiles: [{ absolutePath: mediaPath, zipMediaName: 'source.mp4' }],
    })

    const bytes = await readFile(zipPath)
    expect(bytes.byteLength).toBeGreaterThan(40)
    // Local file header signature PK\x03\x04
    expect(bytes.subarray(0, 2).toString('utf8')).toBe('PK')
  })
})
