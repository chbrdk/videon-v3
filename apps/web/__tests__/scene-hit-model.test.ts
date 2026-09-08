import { describe, expect, it } from 'vitest'
import {
  formatSceneHitClock,
  sceneHitAtMs,
  sceneHitDurationLabel,
  sceneHitOrdinalLabel,
  sceneHitTimingLabel,
} from '../lib/scene-hit-model'

describe('scene-hit-model labels', () => {
  it('formats clock and timing range', () => {
    expect(formatSceneHitClock(65_000)).toBe('01:05')
    expect(sceneHitTimingLabel({ startMs: 1000, endMs: 4500 })).toBe('00:01–00:04')
    expect(sceneHitTimingLabel({ startMs: 12_500, endMs: null })).toBe('00:12')
    expect(sceneHitTimingLabel({ startMs: null, endMs: null })).toBeNull()
  })

  it('formats duration when range is valid', () => {
    expect(sceneHitDurationLabel({ startMs: 1000, endMs: 4500 })).toBe('00:03')
    expect(sceneHitDurationLabel({ startMs: 5000, endMs: 1000 })).toBeNull()
    expect(sceneHitDurationLabel({ startMs: null, endMs: 1000 })).toBeNull()
  })

  it('resolves poster seek ms', () => {
    expect(sceneHitAtMs({ startMs: 2500, endMs: 9000 })).toBe(2500)
    expect(sceneHitAtMs({ startMs: null, endMs: 8000 })).toBe(4000)
    expect(sceneHitAtMs({ startMs: null, endMs: null })).toBe(1000)
  })

  it('builds ordinal labels via formatN', () => {
    expect(sceneHitOrdinalLabel({ sceneKey: 'sc_03' }, 0, (n) => `Scene ${n}`)).toBe('Scene 3')
    expect(sceneHitOrdinalLabel({ sceneKey: 'intro' }, 0, (n) => `Scene ${n}`)).toBe('intro')
    expect(sceneHitOrdinalLabel({ sceneKey: null }, 4, (n) => `Scene ${n}`)).toBe('Scene 5')
  })
})
