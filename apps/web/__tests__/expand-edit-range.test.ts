import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EDIT_INPUT_MIN_MS,
  editInputMinMsForModel,
  expandEditRangeForProvider,
} from '@/lib/generation/expand-edit-range'

describe('expandEditRangeForProvider', () => {
  it('leaves long enough ranges alone', () => {
    const result = expandEditRangeForProvider({
      startMs: 1000,
      endMs: 6000,
      mediaDurationMs: 20_000,
      minInputMs: 4000,
    })
    expect(result).toEqual({
      startMs: 1000,
      endMs: 6000,
      expanded: false,
      insufficient: false,
    })
  })

  it('expands short scenes symmetrically within media', () => {
    const result = expandEditRangeForProvider({
      startMs: 5000,
      endMs: 6200,
      mediaDurationMs: 20_000,
      minInputMs: 4000,
    })
    expect(result.insufficient).toBe(false)
    expect(result.expanded).toBe(true)
    expect(result.endMs - result.startMs).toBeGreaterThanOrEqual(4000)
    expect(result.startMs).toBeLessThanOrEqual(5000)
    expect(result.endMs).toBeGreaterThanOrEqual(6200)
  })

  it('expands toward the available side near media start', () => {
    const result = expandEditRangeForProvider({
      startMs: 0,
      endMs: 1200,
      mediaDurationMs: 10_000,
      minInputMs: 4000,
    })
    expect(result.startMs).toBe(0)
    expect(result.endMs).toBe(4000)
    expect(result.expanded).toBe(true)
    expect(result.insufficient).toBe(false)
  })

  it('flags insufficient when the whole media is too short', () => {
    const result = expandEditRangeForProvider({
      startMs: 0,
      endMs: 1500,
      mediaDurationMs: 2500,
      minInputMs: 4000,
    })
    expect(result.insufficient).toBe(true)
    expect(result.startMs).toBe(0)
    expect(result.endMs).toBe(2500)
  })

  it('uses Seedance 4s floor by default', () => {
    expect(DEFAULT_EDIT_INPUT_MIN_MS).toBe(4000)
    expect(editInputMinMsForModel('seedance_2_5_edit')).toBe(4000)
    expect(editInputMinMsForModel('happy_horse_draft')).toBe(4000)
    expect(editInputMinMsForModel('minimax_hailuo_3_edit')).toBe(5000)
  })
})
