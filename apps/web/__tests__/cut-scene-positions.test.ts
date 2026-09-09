import { describe, expect, it } from 'vitest'
import { finalizeTempPosition, tempPositionForShiftUp } from '@/lib/db/cuts'

describe('cut scene position shift', () => {
  it('maps positions up without colliding with existing slots', () => {
    const existing = [0, 1, 2, 3]
    const from = 2
    const delta = 1
    const temps = existing.filter((p) => p >= from).map((p) => tempPositionForShiftUp(p, delta))
    expect(temps.every((t) => t < 0)).toBe(true)
    expect(new Set(temps).size).toBe(temps.length)
    expect(temps.map(finalizeTempPosition)).toEqual([3, 4])
  })

  it('supports multi-insert shift', () => {
    expect(finalizeTempPosition(tempPositionForShiftUp(3, 2))).toBe(5)
  })
})
