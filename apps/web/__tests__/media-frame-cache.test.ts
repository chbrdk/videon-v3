import { afterEach, describe, expect, it } from 'vitest'
import {
  clearFrameCache,
  frameCacheKey,
  getCachedFrame,
  setCachedFrame,
} from '../lib/media-frame-cache'

describe('media-frame-cache', () => {
  afterEach(() => {
    clearFrameCache()
  })

  it('reuses bytes for the same key within TTL', () => {
    const key = frameCacheKey({
      workspaceId: 'ws-1',
      mediaAssetId: 'm-1',
      tMs: 1000,
      maxWidth: 480,
    })
    const bytes = Buffer.from([1, 2, 3])
    setCachedFrame(key, bytes, { now: 1_000, ttlMs: 5_000 })
    expect(getCachedFrame(key, 1_500)?.equals(bytes)).toBe(true)
    expect(getCachedFrame(key, 7_000)).toBeNull()
  })

  it('uses distinct keys for tMs / maxWidth', () => {
    const a = frameCacheKey({
      workspaceId: 'ws',
      mediaAssetId: 'm',
      tMs: 1000,
      maxWidth: 480,
    })
    const b = frameCacheKey({
      workspaceId: 'ws',
      mediaAssetId: 'm',
      tMs: 2000,
      maxWidth: 480,
    })
    expect(a).not.toBe(b)
  })
})
