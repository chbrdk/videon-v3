import { describe, expect, it } from 'vitest'
import { resolveRepoRoot } from '@/lib/repo-root'

describe('resolveRepoRoot', () => {
  it('walks up from apps/web to the monorepo root', () => {
    expect(resolveRepoRoot().replace(/\\/g, '/')).toMatch(/videon-v3$/)
  })
})

describe('transcriptExcerptForScene', () => {
  it('returns overlapping transcript text for a scene window', async () => {
    const { transcriptExcerptForScene } = await import('@/lib/pipeline/transcribe')
    const segments = [
      { startMs: 0, endMs: 1500, text: 'Hallo Welt' },
      { startMs: 1500, endMs: 4000, text: 'zweiter Satz' },
    ]
    expect(transcriptExcerptForScene(segments, 1000, 3000)).toBe('Hallo Welt zweiter Satz')
    expect(transcriptExcerptForScene(segments, 6000, 8000)).toBeUndefined()
  })
})
