import { describe, expect, it } from 'vitest'
import {
  CUT_SCENE_POSITION_PARK,
  parkedPosition,
  unparkShiftedPosition,
} from '@/lib/db/cuts'

describe('cut scene position shift', () => {
  it('parks and unparks without going negative (CHECK position >= 0)', () => {
    const existing = [0, 1, 2, 3]
    const from = 2
    const delta = 1
    const parked = existing.filter((p) => p >= from).map((p) => parkedPosition(p))
    expect(parked.every((p) => p >= CUT_SCENE_POSITION_PARK)).toBe(true)
    expect(parked.every((p) => p >= 0)).toBe(true)
    expect(parked.map((p) => unparkShiftedPosition(p, delta))).toEqual([3, 4])
  })

  it('supports multi-insert shift', () => {
    expect(unparkShiftedPosition(parkedPosition(3), 2)).toBe(5)
  })
})
