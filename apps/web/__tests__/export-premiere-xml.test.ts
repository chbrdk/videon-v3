import { describe, expect, it } from 'vitest'
import { buildPremiereXmeml } from '@/lib/pipeline/export-premiere-xml'

describe('buildPremiereXmeml', () => {
  it('emits xmeml with cut canvas size', () => {
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
          mediaDurationMs: 10000,
        },
        {
          id: 's2',
          mediaAssetId: 'm2',
          startMs: 500,
          endMs: 1500,
          originalFilename: 'clip-b.mp4',
          mediaDurationMs: 8000,
        },
      ],
    })

    expect(xml).toContain('<xmeml version="4">')
    expect(xml).toContain('<width>1080</width>')
    expect(xml).toContain('<height>1920</height>')
    expect(xml).toContain('<timebase>25</timebase>')
    expect(xml).toContain('file://media/clip-a.mp4')
    expect(xml).toContain('Test Cut')
  })
})
