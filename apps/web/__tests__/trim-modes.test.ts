import { describe, expect, it } from 'vitest'
import { computeTrimPreview } from '@/lib/trim-modes'

describe('trim modes', () => {
  it('computes roll boundary between same-media clips', () => {
    const preview = computeTrimPreview({
      mode: 'roll',
      edge: 'end',
      startMs: 1000,
      endMs: 5000,
      sourceDelta: 500,
      nextClip: { startMs: 5000, endMs: 9000, sameMedia: true },
    })
    expect(preview?.rollBoundaryMs).toBe(5500)
  })

  it('rejects roll when boundary is too close to clip end', () => {
    const preview = computeTrimPreview({
      mode: 'roll',
      edge: 'end',
      startMs: 1000,
      endMs: 8500,
      sourceDelta: 1000,
      nextClip: { startMs: 8500, endMs: 9000, sameMedia: true },
    })
    expect(preview).toBeNull()
  })
})
