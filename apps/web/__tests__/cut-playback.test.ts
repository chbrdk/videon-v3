import { describe, expect, it } from 'vitest'
import { buildCutTimeline } from '@/lib/cut-timeline'
import {
  nextPlaybackTarget,
  resolveClipTransition,
  shouldAdvanceAtSourceMs,
} from '@/lib/cut-playback'

describe('cut playback', () => {
  it('advances at or past clipEnd minus one frame', () => {
    expect(
      shouldAdvanceAtSourceMs({ sourceMs: 1960, clipEndMs: 2000, frameMs: 40 }),
    ).toBe(true)
    expect(
      shouldAdvanceAtSourceMs({ sourceMs: 1959, clipEndMs: 2000, frameMs: 40 }),
    ).toBe(false)
    expect(
      shouldAdvanceAtSourceMs({ sourceMs: 2000, clipEndMs: 2000, frameMs: 40 }),
    ).toBe(true)
  })

  it('returns the next timeline target', () => {
    const timeline = buildCutTimeline([
      { id: 'a', position: 0, mediaAssetId: 'm1', startMs: 0, endMs: 2000 },
      { id: 'b', position: 1, mediaAssetId: 'm1', startMs: 2000, endMs: 5000 },
    ])
    expect(nextPlaybackTarget(timeline, 0)).toEqual({
      index: 1,
      cutStartMs: 2000,
      sourceStartMs: 2000,
      mediaAssetId: 'm1',
    })
    expect(nextPlaybackTarget(timeline, 1)).toBeNull()
  })

  it('classifies same-media seek vs cross-media swap vs sequence end', () => {
    expect(
      resolveClipTransition({
        current: { mediaAssetId: 'm1', startMs: 0, endMs: 2000 },
        next: { mediaAssetId: 'm1', startMs: 2000, endMs: 5000 },
      }),
    ).toBe('same-media-seek')

    expect(
      resolveClipTransition({
        current: { mediaAssetId: 'm1', startMs: 0, endMs: 2000 },
        next: { mediaAssetId: 'm2', startMs: 0, endMs: 3000 },
      }),
    ).toBe('cross-media-swap')

    expect(
      resolveClipTransition({
        current: { mediaAssetId: 'm1', startMs: 0, endMs: 2000 },
        next: null,
      }),
    ).toBe('sequence-end')
  })
})
