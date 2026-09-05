import { describe, expect, it } from 'vitest'
import { transcriptExcerptForScene } from '@/lib/pipeline/transcribe'

describe('transcriptExcerptForScene', () => {
  it('returns overlapping segment text for a scene window', () => {
    const segments = [
      { startMs: 0, endMs: 2000, text: 'Hallo Welt' },
      { startMs: 2500, endMs: 5000, text: 'zweiter Satz' },
    ]
    expect(transcriptExcerptForScene(segments, 1000, 3000)).toBe('Hallo Welt zweiter Satz')
    expect(transcriptExcerptForScene(segments, 6000, 8000)).toBeUndefined()
  })
})
