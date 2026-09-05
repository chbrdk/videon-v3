import { describe, expect, it } from 'vitest'
import { frameDurationMs, normalizeInOutRange } from '@/lib/editor-time'

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
})
