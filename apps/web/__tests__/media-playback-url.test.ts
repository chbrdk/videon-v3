import { describe, expect, it } from 'vitest'
import { mediaStreamPlaybackUrl, normalizeMediaPlaybackUrl } from '@/lib/media-playback-url'

describe('media playback urls', () => {
  it('builds relative stream paths', () => {
    expect(mediaStreamPlaybackUrl('media-1', 'proj-1')).toBe(
      '/api/media/media-1/stream?platformProjectId=proj-1',
    )
  })

  it('strips container-local origins from stream urls', () => {
    expect(
      normalizeMediaPlaybackUrl(
        'http://localhost:3010/api/media/media-1/stream?platformProjectId=proj-1',
      ),
    ).toBe('/api/media/media-1/stream?platformProjectId=proj-1')
  })

  it('keeps relative urls unchanged', () => {
    expect(normalizeMediaPlaybackUrl('/api/media/media-1/stream?platformProjectId=proj-1')).toBe(
      '/api/media/media-1/stream?platformProjectId=proj-1',
    )
  })
})
