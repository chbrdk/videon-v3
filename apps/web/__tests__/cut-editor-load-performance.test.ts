import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  mediaFramePosterUrl,
  mediaFrameSeekMs,
  withFrameRequestSlot,
} from '@/lib/media-frame-poster'

describe('cut editor load performance', () => {
  it('buckets frame seek times for cache reuse', () => {
    expect(mediaFrameSeekMs(1010)).toBe(1000)
    expect(mediaFrameSeekMs(1120)).toBe(1000)
    expect(mediaFrameSeekMs(1260)).toBe(1250)
  })

  it('builds Frame API poster URLs with platformProjectId and t', () => {
    const url = mediaFramePosterUrl('media-1', 'proj-1', 1500)
    expect(url).toContain('/api/media/media-1/frame?')
    expect(url).toContain('platformProjectId=proj-1')
    expect(url).toContain('t=1500')
  })

  it('caps concurrent frame loads at 4', async () => {
    let concurrent = 0
    let maxConcurrent = 0
    const tasks = Array.from({ length: 8 }, async () =>
      withFrameRequestSlot(async () => {
        concurrent += 1
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        await new Promise((r) => setTimeout(r, 20))
        concurrent -= 1
      }),
    )
    await Promise.all(tasks)
    expect(maxConcurrent).toBeLessThanOrEqual(4)
  })

  it('MediaCardThumb and TimelineClipThumbnail prefer Frame API + lazy in-view + capped load', () => {
    const card = readFileSync(join(__dirname, '../components/media-card-thumb.tsx'), 'utf8')
    const thumb = readFileSync(join(__dirname, '../components/timeline-clip-thumbnail.tsx'), 'utf8')
    const view = readFileSync(join(__dirname, '../components/cut-editor-view.tsx'), 'utf8')
    const audio = readFileSync(join(__dirname, '../components/timeline-audio-track.tsx'), 'utf8')
    const hit = readFileSync(join(__dirname, '../components/scene-search-hit-strip.tsx'), 'utf8')
    expect(card).toMatch(/mediaFramePosterAtDuration/)
    expect(card).toMatch(/useInViewOnce/)
    expect(card).toMatch(/useFramePoster/)
    expect(card).not.toMatch(/useClipThumbnail/)
    expect(thumb).toMatch(/mediaFramePosterUrl/)
    expect(thumb).toMatch(/useInViewOnce/)
    expect(thumb).toMatch(/useFramePoster/)
    expect(view).toMatch(/mediaStreamPlaybackUrl/)
    expect(view).toMatch(/requestIdleCallback/)
    expect(view).not.toMatch(/apiMediaPlayback/)
    expect(view).not.toMatch(/prefetchWaveformPeaks/)
    expect(audio).toMatch(/lazyPeaks/)
    expect(audio).toMatch(/prefetchWaveformPeaks/)
    expect(hit).toMatch(/mediaFramePosterUrl/)
    expect(hit).not.toMatch(/useClipThumbnail/)
  })

  it('A1 TimelineAudioTrack enables lazyPeaks in cut timeline', () => {
    const timeline = readFileSync(join(__dirname, '../components/cut-timeline.tsx'), 'utf8')
    expect(timeline).toMatch(/label="Source Audio · Voice"[\s\S]*lazyPeaks/)
  })
})
