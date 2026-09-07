import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CUT_TRACK_STATE,
  DEFAULT_SOURCE_TRACK_STATE,
} from '@/components/timeline-track-header'

describe('timeline track defaults', () => {
  it('starts with all source tracks visible and unmuted', () => {
    expect(DEFAULT_SOURCE_TRACK_STATE.v1).toEqual({ hidden: false, muted: false })
    expect(DEFAULT_SOURCE_TRACK_STATE.si).toEqual({ hidden: false, muted: false })
    expect(DEFAULT_SOURCE_TRACK_STATE.a1).toEqual({ hidden: false, muted: false })
    expect(DEFAULT_SOURCE_TRACK_STATE.a2).toEqual({ hidden: false, muted: false })
    expect(DEFAULT_SOURCE_TRACK_STATE.tx).toEqual({ hidden: false, muted: false })
  })

  it('cut timeline has no scene-insight track by default', () => {
    expect(Object.keys(DEFAULT_CUT_TRACK_STATE).sort()).toEqual(['a1', 'a2', 'tx', 'v1'])
  })
})
