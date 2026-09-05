import { describe, expect, it } from 'vitest'
import { frameDurationMs, formatTimecode, normalizeInOutRange } from '@/lib/editor-time'

describe('editor time helpers', () => {
  it('derives frame duration from frame rate', () => {
    expect(frameDurationMs(25)).toBe(40)
    expect(frameDurationMs(null)).toBe(40)
  })

  it('normalizes in/out ranges', () => {
    expect(normalizeInOutRange({ inMs: 2000, outMs: 5000, durationMs: 10_000 })).toEqual({
      startMs: 2000,
      endMs: 5000,
    })
    expect(normalizeInOutRange({ inMs: 5000, outMs: 2000, durationMs: 10_000 })).toEqual({
      startMs: 2000,
      endMs: 5000,
    })
  })

  it('formats SMPTE-like timecode', () => {
    expect(formatTimecode(65_000, 25)).toBe('01:05:00')
    expect(formatTimecode(3_601_000, 25)).toBe('1:00:01:00')
  })
})
