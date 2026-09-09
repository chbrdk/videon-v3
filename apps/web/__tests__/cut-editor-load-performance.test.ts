import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  FRAME_WIDTH_BIN,
  mediaFramePosterUrl,
  mediaFrameSeekMs,
} from '@/lib/media-frame-poster'
import { snapFrameWidth } from '@/lib/pipeline/poster-frames'
import { mediaPosterStorageKey } from '@/lib/storage/object-store'

describe('cut editor load performance — wave 4', () => {
  it('buckets frame seek times for cache reuse', () => {
    expect(mediaFrameSeekMs(1010)).toBe(1000)
    expect(mediaFrameSeekMs(1120)).toBe(1000)
    expect(mediaFrameSeekMs(1260)).toBe(1250)
  })

  it('snaps width query to poster tiers', () => {
    expect(snapFrameWidth(100)).toBe(160)
    expect(snapFrameWidth(220)).toBe(240)
    expect(snapFrameWidth(400)).toBe(480)
    expect(snapFrameWidth(undefined)).toBe(480)
  })

  it('builds Frame API poster URLs with platformProjectId, t, and w', () => {
    const url = mediaFramePosterUrl('media-1', 'proj-1', 1500, FRAME_WIDTH_BIN)
    expect(url).toContain('/api/media/media-1/frame?')
    expect(url).toContain('platformProjectId=proj-1')
    expect(url).toContain('t=1500')
    expect(url).toContain('w=160')
  })

  it('builds S3 poster storage keys', () => {
    expect(mediaPosterStorageKey('ws-1', 'media-1', 240, 1000)).toBe(
      'ws-1/media/media-1/posters/w240/t1000.jpg',
    )
  })

  it('Wave 4 surfaces: direct Frame URL, eager warm, peaks backfill, monitor poster', () => {
    const card = readFileSync(join(__dirname, '../components/media-card-thumb.tsx'), 'utf8')
    const thumb = readFileSync(join(__dirname, '../components/timeline-clip-thumbnail.tsx'), 'utf8')
    const view = readFileSync(join(__dirname, '../components/cut-editor-view.tsx'), 'utf8')
    const frameRoute = readFileSync(join(__dirname, '../app/api/media/[mediaAssetId]/frame/route.ts'), 'utf8')
    const pipeline = readFileSync(join(__dirname, '../lib/pipeline/run-analysis.ts'), 'utf8')
    const backfill = readFileSync(join(__dirname, '../lib/pipeline/backfill-mix-peaks.ts'), 'utf8')
    expect(card).toMatch(/loading="lazy"/)
    expect(card).not.toMatch(/useFramePoster/)
    expect(card).not.toMatch(/loadFramePosterBlobUrl/)
    expect(thumb).toMatch(/FRAME_WIDTH_TIMELINE/)
    expect(thumb).toMatch(/loading="lazy"/)
    expect(view).toMatch(/preload=\{monitorEngaged/)
    expect(view).toMatch(/poster=\{activePosterUrl/)
    expect(view).toMatch(/apiMediaPeaksBackfill/)
    expect(frameRoute).toMatch(/readPosterJpeg/)
    expect(frameRoute).toMatch(/uploadPosterJpeg/)
    expect(frameRoute).toMatch(/max-age=86400/)
    expect(pipeline).toMatch(/warmMediaPosterFrames/)
    expect(backfill).toMatch(/ffmpeg_mono_wav_backfill/)
  })
})
