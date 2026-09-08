import { describe, expect, it } from 'vitest'
import { cutExportNeedsNormalize } from '@/lib/pipeline/export-cut'

describe('multi-source compose helpers', () => {
  it('documents storage key scope via cutExportNeedsNormalize multi-id', () => {
    const media = new Map([
      ['a', { width: 1920, height: 1080, frameRate: 25 }],
      ['b', { width: 1920, height: 1080, frameRate: 25 }],
    ])
    expect(
      cutExportNeedsNormalize(
        { width: 1920, height: 1080, frameRate: 25 },
        [{ mediaAssetId: 'a' }, { mediaAssetId: 'b' }],
        media,
      ),
    ).toBe(true)
  })
})
