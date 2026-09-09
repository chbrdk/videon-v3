import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mediaFramePosterUrl, mediaFrameSeekMs } from '@/lib/media-frame-poster'

describe('cut editor load performance — wave 1', () => {
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

  it('MediaCardThumb and TimelineClipThumbnail prefer Frame API + lazy in-view', () => {
    const card = readFileSync(join(__dirname, '../components/media-card-thumb.tsx'), 'utf8')
    const thumb = readFileSync(join(__dirname, '../components/timeline-clip-thumbnail.tsx'), 'utf8')
    const view = readFileSync(join(__dirname, '../components/cut-editor-view.tsx'), 'utf8')
    expect(card).toMatch(/mediaFramePosterAtDuration/)
    expect(card).toMatch(/useInViewOnce/)
    expect(card).not.toMatch(/useClipThumbnail/)
    expect(thumb).toMatch(/mediaFramePosterUrl/)
    expect(thumb).toMatch(/useInViewOnce/)
    expect(view).toMatch(/mediaStreamPlaybackUrl/)
    expect(view).toMatch(/requestIdleCallback/)
    expect(view).not.toMatch(/apiMediaPlayback/)
  })
})
