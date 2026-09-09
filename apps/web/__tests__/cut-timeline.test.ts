import { describe, expect, it } from 'vitest'
import {
  buildCutTimeline,
  cutPlayheadForSourceMs,
  cutTotalDurationMs,
  findTimelineItemAtCutMs,
  mapTranscriptToCutTimeline,
  splitSourceMsForCutPlayhead,
  sourceMsForCutPlayhead,
} from '@/lib/cut-timeline'

const scenes = [
  { id: 'a', position: 0, mediaAssetId: 'm1', startMs: 1000, endMs: 4000, timelineStartMs: 0 },
  { id: 'b', position: 1, mediaAssetId: 'm2', startMs: 0, endMs: 2000, timelineStartMs: 3000 },
]

describe('cut timeline mapping', () => {
  const timeline = buildCutTimeline(scenes)

  it('builds cut offsets from timelineStartMs + source duration', () => {
    expect(timeline).toHaveLength(2)
    expect(timeline[0]?.cutStartMs).toBe(0)
    expect(timeline[0]?.durationMs).toBe(3000)
    expect(timeline[1]?.cutStartMs).toBe(3000)
    expect(cutTotalDurationMs(scenes)).toBe(5000)
  })

  it('supports gaps in total duration', () => {
    const gapped = [
      { id: 'a', position: 0, mediaAssetId: 'm1', startMs: 0, endMs: 1000, timelineStartMs: 0 },
      { id: 'b', position: 1, mediaAssetId: 'm2', startMs: 0, endMs: 1000, timelineStartMs: 5000 },
    ]
    expect(cutTotalDurationMs(gapped)).toBe(6000)
    expect(findTimelineItemAtCutMs(buildCutTimeline(gapped), 2500)).toBeNull()
  })

  it('picks higher position as overlap winner', () => {
    const overlapped = [
      { id: 'a', position: 0, mediaAssetId: 'm1', startMs: 0, endMs: 4000, timelineStartMs: 0 },
      { id: 'b', position: 2, mediaAssetId: 'm2', startMs: 0, endMs: 2000, timelineStartMs: 1000 },
    ]
    const tl = buildCutTimeline(overlapped)
    expect(findTimelineItemAtCutMs(tl, 1500)?.scene.id).toBe('b')
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

describe('mapTranscriptToCutTimeline', () => {
  it('maps source transcript segments onto cut offsets', () => {
    const timeline = buildCutTimeline([
      { id: 'a', position: 0, mediaAssetId: 'm1', startMs: 1000, endMs: 4000, timelineStartMs: 0 },
      { id: 'b', position: 1, mediaAssetId: 'm2', startMs: 0, endMs: 2000, timelineStartMs: 3000 },
    ])
    const mapped = mapTranscriptToCutTimeline(timeline, {
      m1: [{ startMs: 2000, endMs: 3500, text: 'erster clip' }],
      m2: [{ startMs: 500, endMs: 1500, text: 'zweiter clip' }],
    })
    expect(mapped).toEqual([
      expect.objectContaining({ text: 'erster clip', cutStartMs: 1000, cutEndMs: 2500 }),
      expect.objectContaining({ text: 'zweiter clip', cutStartMs: 3500, cutEndMs: 4500 }),
    ])
  })
})
