import { describe, expect, it } from 'vitest'
import { CUT_RAIL_LIMITS } from '@/lib/cut-editor-rails'

describe('cut-editor-rails', () => {
  it('exposes dock size limits for Cut dual rails', () => {
    expect(CUT_RAIL_LIMITS.min).toBe(220)
    expect(CUT_RAIL_LIMITS.max).toBe(480)
    expect(CUT_RAIL_LIMITS.leftDefault).toBeGreaterThanOrEqual(CUT_RAIL_LIMITS.min)
    expect(CUT_RAIL_LIMITS.rightDefault).toBeLessThanOrEqual(CUT_RAIL_LIMITS.max)
  })
})
