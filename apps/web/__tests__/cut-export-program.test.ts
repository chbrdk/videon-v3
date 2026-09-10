import { describe, expect, it } from 'vitest'
import { buildProgramExportSlices } from '@/lib/cut-export-program'

describe('buildProgramExportSlices', () => {
  it('inserts black for gaps', () => {
    const slices = buildProgramExportSlices([
      { id: 'a', position: 0, mediaAssetId: 'm1', startMs: 0, endMs: 1000, timelineStartMs: 0 },
      { id: 'b', position: 1, mediaAssetId: 'm2', startMs: 0, endMs: 1000, timelineStartMs: 3000 },
    ])
    expect(slices).toEqual([
      { kind: 'media', sceneId: 'a', mediaAssetId: 'm1', startMs: 0, endMs: 1000 },
      { kind: 'black', durationMs: 2000 },
      { kind: 'media', sceneId: 'b', mediaAssetId: 'm2', startMs: 0, endMs: 1000 },
    ])
  })

  it('keeps only the higher-position winner across overlaps', () => {
    const slices = buildProgramExportSlices([
      { id: 'a', position: 0, mediaAssetId: 'm1', startMs: 0, endMs: 4000, timelineStartMs: 0 },
      { id: 'b', position: 2, mediaAssetId: 'm2', startMs: 0, endMs: 2000, timelineStartMs: 1000 },
    ])
    expect(slices).toEqual([
      { kind: 'media', sceneId: 'a', mediaAssetId: 'm1', startMs: 0, endMs: 1000 },
      { kind: 'media', sceneId: 'b', mediaAssetId: 'm2', startMs: 0, endMs: 2000 },
      { kind: 'media', sceneId: 'a', mediaAssetId: 'm1', startMs: 3000, endMs: 4000 },
    ])
  })

  it('pads black when busEndMs extends past picture', () => {
    const slices = buildProgramExportSlices(
      [{ id: 'a', position: 0, mediaAssetId: 'm1', startMs: 0, endMs: 1000, timelineStartMs: 0 }],
      { busEndMs: 2500 },
    )
    expect(slices.at(-1)).toEqual({ kind: 'black', durationMs: 1500 })
  })
})
