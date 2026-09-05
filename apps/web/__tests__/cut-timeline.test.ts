import { describe, expect, it } from 'vitest'
import {
  buildCutTimeline,
  cutPlayheadForSourceMs,
  cutTotalDurationMs,
  splitSourceMsForCutPlayhead,
  sourceMsForCutPlayhead,
} from '@/lib/cut-timeline'

const scenes = [
  { id: 'a', position: 0, mediaAssetId: 'm1', startMs: 1000, endMs: 4000 },
  { id: 'b', position: 1, mediaAssetId: 'm2', startMs: 0, endMs: 2000 },
]

describe('cut timeline mapping', () => {
  const timeline = buildCutTimeline(scenes)

  it('builds sequential cut offsets from source in/out ranges', () => {
    expect(timeline).toHaveLength(2)
    expect(timeline[0]?.cutStartMs).toBe(0)
    expect(timeline[0]?.durationMs).toBe(3000)
    expect(timeline[1]?.cutStartMs).toBe(3000)
    expect(cutTotalDurationMs(scenes)).toBe(5000)
  })

  it('maps cut playhead to source time inside the active clip', () => {
    expect(sourceMsForCutPlayhead(timeline, 1500)?.sourceMs).toBe(2500)
    expect(sourceMsForCutPlayhead(timeline, 3500)?.sourceMs).toBe(500)
  })

  it('maps source time back to cut playhead', () => {
    expect(cutPlayheadForSourceMs(timeline, 'a', 2500)).toBe(1500)
    expect(cutPlayheadForSourceMs(timeline, 'b', 500)).toBe(3500)
  })

  it('returns split point in source milliseconds', () => {
    expect(splitSourceMsForCutPlayhead(timeline, 1500)).toEqual({ sceneId: 'a', atMs: 2500 })
    expect(splitSourceMsForCutPlayhead(timeline, 100)).toBeNull()
  })
})
