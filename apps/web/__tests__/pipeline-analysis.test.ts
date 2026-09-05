import { describe, expect, it } from 'vitest'
import { detectScenes } from '@/lib/pipeline/scene-detect'
import { analysisInputFingerprint, PIPELINE_VERSION } from '@/lib/pipeline/constants'

describe('detectScenes', () => {
  it('splits long videos into bounded windows', () => {
    expect(detectScenes(65_000)).toHaveLength(3)
    expect(detectScenes(65_000)[0]).toEqual({ key: 'scene-0', startMs: 0, endMs: 30_000 })
  })

  it('creates at least one scene for short clips', () => {
    expect(detectScenes(4_000)).toEqual([{ key: 'scene-0', startMs: 0, endMs: 4_000 }])
  })
})

describe('analysisInputFingerprint', () => {
  it('binds pipeline and schema versions to the media checksum', () => {
    const digest = 'a'.repeat(64)
    expect(analysisInputFingerprint(digest)).toBe(`${PIPELINE_VERSION}:videon.scene-insight.v1:${digest}`)
  })
})
