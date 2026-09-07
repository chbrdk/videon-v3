import { describe, expect, it } from 'vitest'
import { mediaStemStorageKey } from '@/lib/storage/object-store'
import { paths } from '@/lib/paths'

describe('media stem stream path', () => {
  it('scopes stem objects under the media asset', () => {
    expect(mediaStemStorageKey('ws-1', 'media-1', 'voice')).toBe('ws-1/media/media-1/stems/voice.wav')
    expect(mediaStemStorageKey('ws-1', 'media-1', 'music')).toBe('ws-1/media/media-1/stems/music.wav')
  })

  it('builds collection-scoped stem stream routes', () => {
    expect(paths.routes.apiMediaStemStream('media-1', 'voice', 'proj-1')).toBe(
      '/api/media/media-1/stems/voice/stream?platformProjectId=proj-1',
    )
    expect(paths.routes.apiMediaStemStream('media-1', 'music', 'proj-1')).toBe(
      '/api/media/media-1/stems/music/stream?platformProjectId=proj-1',
    )
  })

  it('builds stem download routes with attachment flag', () => {
    expect(paths.routes.apiMediaStemStream('media-1', 'voice', 'proj-1', { download: true })).toBe(
      '/api/media/media-1/stems/voice/stream?platformProjectId=proj-1&download=1',
    )
    expect(paths.routes.apiMediaStemStream('media-1', 'music', 'proj-1', { download: true })).toBe(
      '/api/media/media-1/stems/music/stream?platformProjectId=proj-1&download=1',
    )
  })
})
