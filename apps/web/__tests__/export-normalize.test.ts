import { describe, expect, it } from 'vitest'
import { cutExportNeedsNormalize } from '@/lib/pipeline/export-cut'

describe('cutExportNeedsNormalize', () => {
  it('is false for single matching source', () => {
    const media = new Map([
      ['m1', { width: 1920, height: 1080, frameRate: 25 }],
    ])
    expect(
      cutExportNeedsNormalize(
        { width: 1920, height: 1080, frameRate: 25 },
        [{ mediaAssetId: 'm1' }, { mediaAssetId: 'm1' }],
        media,
      ),
    ).toBe(false)
  })

  it('is true for multiple media ids', () => {
    const media = new Map([
      ['m1', { width: 1920, height: 1080, frameRate: 25 }],
      ['m2', { width: 1920, height: 1080, frameRate: 25 }],
    ])
    expect(
      cutExportNeedsNormalize(
        { width: 1920, height: 1080, frameRate: 25 },
        [{ mediaAssetId: 'm1' }, { mediaAssetId: 'm2' }],
        media,
      ),
    ).toBe(true)
  })

  it('is true when dimensions differ from cut', () => {
    const media = new Map([['m1', { width: 1280, height: 720, frameRate: 25 }]])
    expect(
      cutExportNeedsNormalize(
        { width: 1920, height: 1080, frameRate: 25 },
        [{ mediaAssetId: 'm1' }],
        media,
      ),
    ).toBe(true)
  })
})
