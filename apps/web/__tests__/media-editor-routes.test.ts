import { describe, expect, it } from 'vitest'
import { analysisInputFingerprint } from '@/lib/pipeline/constants'
import { paths } from '@/lib/paths'

describe('media workspace routes', () => {
  it('builds federation media detail and playback links', () => {
    expect(paths.routes.mediaFor('media-1', 'proj-1')).toBe(
      '/media/media-1?platformProjectId=proj-1',
    )
    expect(paths.routes.apiMediaPlayback('media-1', 'proj-1')).toBe(
      '/api/media/media-1/playback?platformProjectId=proj-1',
    )
    expect(paths.routes.apiMediaAnalysis('media-1', 'proj-1')).toBe(
      '/api/media/media-1/analysis?platformProjectId=proj-1',
    )
  })
})

describe('analysis rerun fingerprint', () => {
  it('binds reruns to the same checksum fingerprint', () => {
    const digest = 'b'.repeat(64)
    expect(analysisInputFingerprint(digest)).toContain(digest)
  })
})
