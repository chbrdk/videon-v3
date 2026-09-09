import { describe, expect, it } from 'vitest'
import { resolveVideoLaneDrop } from '@/lib/cut-lane-drop'

describe('resolveVideoLaneDrop', () => {
  const v1 = { top: 0, bottom: 40 }
  const v2 = { top: 160, bottom: 200 } // A1/A2/TX occupy 40–160

  it('hits V1 and V2 tracks directly', () => {
    expect(resolveVideoLaneDrop({ clientY: 20, v1, v2 })).toBe('v1')
    expect(resolveVideoLaneDrop({ clientY: 180, v1, v2 })).toBe('v2')
  })

  it('splits companion band between V1 and V2 at midpoint', () => {
    // split = (40 + 160) / 2 = 100
    expect(resolveVideoLaneDrop({ clientY: 99, v1, v2 })).toBe('v1')
    expect(resolveVideoLaneDrop({ clientY: 100, v1, v2 })).toBe('v2')
    expect(resolveVideoLaneDrop({ clientY: 150, v1, v2 })).toBe('v2')
  })

  it('treats V2 companion zone below V2 as V2', () => {
    expect(resolveVideoLaneDrop({ clientY: 240, v1, v2 })).toBe('v2')
  })

  it('handles missing rects', () => {
    expect(resolveVideoLaneDrop({ clientY: 10, v1: null, v2: null })).toBeNull()
    expect(resolveVideoLaneDrop({ clientY: 10, v1, v2: null })).toBe('v1')
    expect(resolveVideoLaneDrop({ clientY: 10, v1: null, v2 })).toBe('v2')
  })
})
