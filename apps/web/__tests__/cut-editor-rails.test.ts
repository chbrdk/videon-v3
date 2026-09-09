import { describe, expect, it } from 'vitest'
import { CUT_RAIL_LIMITS } from '@/lib/cut-editor-rails'

describe('cut-editor-rails', () => {
  it('exposes dock size limits for Cut dual rails', () => {
    expect(CUT_RAIL_LIMITS.min).toBe(200)
    expect(CUT_RAIL_LIMITS.max).toBe(440)
    expect(CUT_RAIL_LIMITS.leftDefault).toBe(256)
    expect(CUT_RAIL_LIMITS.rightDefault).toBe(272)
    expect(CUT_RAIL_LIMITS.leftDefault).toBeGreaterThanOrEqual(CUT_RAIL_LIMITS.min)
    expect(CUT_RAIL_LIMITS.rightDefault).toBeLessThanOrEqual(CUT_RAIL_LIMITS.max)
  })
})
