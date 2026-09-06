import { describe, expect, it } from 'vitest'
import { mediaStemStorageKey } from '@/lib/storage/object-store'

describe('media stem storage keys', () => {
  it('scopes stem objects under the media asset', () => {
    expect(mediaStemStorageKey('ws-1', 'media-1', 'voice')).toBe('ws-1/media/media-1/stems/voice.wav')
    expect(mediaStemStorageKey('ws-1', 'media-1', 'music')).toBe('ws-1/media/media-1/stems/music.wav')
  })
})
