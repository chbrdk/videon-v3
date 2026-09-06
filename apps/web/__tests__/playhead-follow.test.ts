import { describe, expect, it } from 'vitest'
import { activeTranscriptIndex } from '@/lib/use-playhead-follow'

describe('activeTranscriptIndex', () => {
  const segments = [
    { startMs: 0, endMs: 1200 },
    { startMs: 1200, endMs: 2800 },
    { startMs: 4000, endMs: 5200 },
  ]

  it('returns the segment covering the playhead', () => {
    expect(activeTranscriptIndex(1500, segments)).toBe(1)
  })

  it('returns -1 when far from any segment', () => {
    expect(activeTranscriptIndex(3400, segments)).toBe(-1)
  })

  it('snaps to a nearby segment edge within tolerance', () => {
    expect(activeTranscriptIndex(3950, segments)).toBe(2)
  })
})
