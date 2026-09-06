import { describe, expect, it } from 'vitest'
import { computeTrimPreview } from '@/lib/trim-modes'

describe('trim modes', () => {
  it('slips the source window while keeping duration', () => {
    const preview = computeTrimPreview({
      mode: 'trim',
      edge: 'end',
      startMs: 1000,
      endMs: 4000,
      sourceDelta: 500,
      mediaDurationMs: 20_000,
    })
    expect(preview).toEqual({ startMs: 1500, endMs: 4500 })
  })

  it('clamps slip at media start without changing duration', () => {
    const preview = computeTrimPreview({
      mode: 'trim',
      edge: 'start',
      startMs: 200,
      endMs: 2200,
      sourceDelta: -500,
      mediaDurationMs: 10_000,
    })
    expect(preview).toEqual({ startMs: 0, endMs: 2000 })
  })

  it('rejects slip that cannot keep duration at media end', () => {
    const preview = computeTrimPreview({
      mode: 'trim',
      edge: 'end',
      startMs: 8500,
      endMs: 10_000,
      sourceDelta: 500,
      mediaDurationMs: 10_000,
    })
    expect(preview).toBeNull()
  })

  it('ripples the start edge and shortens duration', () => {
    const preview = computeTrimPreview({
      mode: 'ripple',
      edge: 'start',
      startMs: 1000,
      endMs: 5000,
      sourceDelta: 800,
      mediaDurationMs: 20_000,
    })
    expect(preview).toEqual({ startMs: 1800, endMs: 5000 })
  })

  it('ripples the end edge up to media duration', () => {
    const preview = computeTrimPreview({
      mode: 'ripple',
      edge: 'end',
      startMs: 1000,
      endMs: 5000,
      sourceDelta: 20_000,
      mediaDurationMs: 8000,
    })
    expect(preview).toEqual({ startMs: 1000, endMs: 8000 })
  })

  it('rejects ripple when clip is already below minimum duration', () => {
    const preview = computeTrimPreview({
      mode: 'ripple',
      edge: 'end',
      startMs: 1000,
      endMs: 1400,
      sourceDelta: -500,
      mediaDurationMs: 20_000,
    })
    expect(preview).toBeNull()
  })

  it('ripples end down but stops at minimum duration', () => {
    const preview = computeTrimPreview({
      mode: 'ripple',
      edge: 'end',
      startMs: 1000,
      endMs: 3000,
      sourceDelta: -2500,
      mediaDurationMs: 20_000,
    })
    expect(preview).toEqual({ startMs: 1000, endMs: 1500 })
  })

  it('computes roll boundary between same-media clips', () => {
    const preview = computeTrimPreview({
      mode: 'roll',
      edge: 'end',
      startMs: 1000,
      endMs: 5000,
      sourceDelta: 500,
      mediaDurationMs: 20_000,
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
      mediaDurationMs: 20_000,
      nextClip: { startMs: 8500, endMs: 9000, sameMedia: true },
    })
    expect(preview).toBeNull()
  })

  it('rejects roll for different media neighbors', () => {
    const preview = computeTrimPreview({
      mode: 'roll',
      edge: 'end',
      startMs: 1000,
      endMs: 5000,
      sourceDelta: 500,
      mediaDurationMs: 20_000,
      nextClip: { startMs: 5000, endMs: 9000, sameMedia: false },
    })
    expect(preview).toBeNull()
  })
})
