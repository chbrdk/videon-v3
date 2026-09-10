import { describe, expect, it } from 'vitest'
import { findProgramVideoAtCutMs } from '@/lib/cut-program-hit'
import { buildProgramExportSlices, busClipsEndMs } from '@/lib/cut-export-program'

describe('findProgramVideoAtCutMs', () => {
  const v1 = [
    { id: 'a', position: 0, mediaAssetId: 'm1', startMs: 0, endMs: 4000, timelineStartMs: 0 },
  ]
  const v2 = [
    {
      id: 'ov',
      mediaAssetId: 'm2',
      position: 0,
      timelineStartMs: 1000,
      startMs: 0,
      endMs: 2000,
    },
  ]

  it('prefers unmuted V2 overlay over V1', () => {
    const hit = findProgramVideoAtCutMs({ cutMs: 1500, v1Scenes: v1, v2Clips: v2, v2Muted: false })
    expect(hit?.lane).toBe('v2')
    if (hit?.lane === 'v2') {
      expect(hit.clip.id).toBe('ov')
      expect(hit.sourceMs).toBe(500)
    }
  })

  it('falls back to V1 when V2 is muted', () => {
    const hit = findProgramVideoAtCutMs({ cutMs: 1500, v1Scenes: v1, v2Clips: v2, v2Muted: true })
    expect(hit?.lane).toBe('v1')
  })
})

describe('buildProgramExportSlices with V2', () => {
  it('replaces V1 coverage with V2 media', () => {
    const slices = buildProgramExportSlices(
      [{ id: 'a', position: 0, mediaAssetId: 'm1', startMs: 0, endMs: 4000, timelineStartMs: 0 }],
      {
        v2Clips: [
          {
            id: 'ov',
            mediaAssetId: 'm2',
            position: 0,
            timelineStartMs: 1000,
            startMs: 0,
            endMs: 2000,
          },
        ],
      },
    )
    expect(slices).toEqual([
      { kind: 'media', sceneId: 'a', mediaAssetId: 'm1', startMs: 0, endMs: 1000 },
      { kind: 'media', sceneId: 'ov', mediaAssetId: 'm2', startMs: 0, endMs: 2000 },
      { kind: 'media', sceneId: 'a', mediaAssetId: 'm1', startMs: 3000, endMs: 4000 },
    ])
  })

  it('pads black through VO bus end past picture', () => {
    const slices = buildProgramExportSlices(
      [{ id: 'a', position: 0, mediaAssetId: 'm1', startMs: 0, endMs: 1000, timelineStartMs: 0 }],
      { busEndMs: 3000 },
    )
    expect(slices).toEqual([
      { kind: 'media', sceneId: 'a', mediaAssetId: 'm1', startMs: 0, endMs: 1000 },
      { kind: 'black', durationMs: 2000 },
    ])
  })
})

describe('busClipsEndMs', () => {
  it('returns the latest bus timeline end', () => {
    expect(
      busClipsEndMs([
        { timelineStartMs: 0, startMs: 0, endMs: 1000 },
        { timelineStartMs: 500, startMs: 0, endMs: 4000 },
      ]),
    ).toBe(4500)
  })
})
