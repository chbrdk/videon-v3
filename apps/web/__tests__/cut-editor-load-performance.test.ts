import { describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  mediaFramePosterUrl,
  mediaFrameSeekMs,
  withFrameRequestSlot,
} from '@/lib/media-frame-poster'
import { peaksFromMonoWavFile } from '@/lib/pipeline/wav-peaks'
import { downsamplePeaks } from '@/lib/editor-time'

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

  it('reads mix peaks from a mono 16-bit WAV', async () => {
    // Minimal WAV: 8 samples of silence + one loud sample pattern
    const samples = 480
    const dataSize = samples * 2
    const buffer = Buffer.alloc(44 + dataSize)
    buffer.write('RIFF', 0)
    buffer.writeUInt32LE(36 + dataSize, 4)
    buffer.write('WAVE', 8)
    buffer.write('fmt ', 12)
    buffer.writeUInt32LE(16, 16)
    buffer.writeUInt16LE(1, 20) // PCM
    buffer.writeUInt16LE(1, 22) // mono
    buffer.writeUInt32LE(16000, 24)
    buffer.writeUInt32LE(32000, 28)
    buffer.writeUInt16LE(2, 32)
    buffer.writeUInt16LE(16, 34)
    buffer.write('data', 36)
    buffer.writeUInt32LE(dataSize, 40)
    for (let i = 0; i < samples; i += 1) {
      const value = i % 40 === 0 ? 20000 : 100
      buffer.writeInt16LE(value, 44 + i * 2)
    }
    const path = join(tmpdir(), `videon-wav-peaks-${Date.now()}.wav`)
    writeFileSync(path, buffer)
    try {
      const peaks = await peaksFromMonoWavFile(path, 12)
      expect(peaks.length).toBe(12)
      expect(Math.max(...peaks)).toBeGreaterThan(0.4)
    } finally {
      unlinkSync(path)
    }
  })

  it('downsamplePeaks stays within unit range for Float32 channel data', () => {
    const channel = new Float32Array([0, 0.5, -1, 0.25])
    const peaks = downsamplePeaks(channel, 2)
    expect(peaks.every((p) => p >= 0 && p <= 1)).toBe(true)
  })

  it('Wave 3 surfaces: mixPeaks path, Frame fallback, filmstrip Frame IDs', () => {
    const card = readFileSync(join(__dirname, '../components/media-card-thumb.tsx'), 'utf8')
    const thumb = readFileSync(join(__dirname, '../components/timeline-clip-thumbnail.tsx'), 'utf8')
    const view = readFileSync(join(__dirname, '../components/cut-editor-view.tsx'), 'utf8')
    const audio = readFileSync(join(__dirname, '../components/timeline-audio-track.tsx'), 'utf8')
    const hit = readFileSync(join(__dirname, '../components/scene-search-hit-strip.tsx'), 'utf8')
    const source = readFileSync(join(__dirname, '../components/source-media-timeline.tsx'), 'utf8')
    const media = readFileSync(join(__dirname, '../components/media-editor-view.tsx'), 'utf8')
    const pipeline = readFileSync(join(__dirname, '../lib/pipeline/run-analysis.ts'), 'utf8')
    const clientThumb = readFileSync(join(__dirname, '../lib/use-clip-thumbnail.ts'), 'utf8')
    expect(card).toMatch(/useFramePoster/)
    expect(card).toMatch(/status === 'error'/)
    expect(thumb).toMatch(/status === 'error'/)
    expect(thumb).toMatch(/useClipThumbnail/)
    expect(view).toMatch(/mixPeaks/)
    expect(view).not.toMatch(/prefetchWaveformPeaks/)
    expect(audio).toMatch(/mixPeaksByMediaId/)
    expect(audio).toMatch(/lazyPeaks/)
    expect(hit).toMatch(/mediaFramePosterUrl/)
    expect(hit).not.toMatch(/useClipThumbnail/)
    expect(source).toMatch(/mediaAssetId=\{mediaAssetId\}/)
    expect(media).toMatch(/mixPeaks/)
    expect(media).toMatch(/needsClientWaveform/)
    expect(pipeline).toMatch(/upsertMediaWaveformPeaks/)
    expect(pipeline).toMatch(/peaksFromMonoWavFile/)
    expect(clientThumb).toMatch(/MAX_CLIENT_THUMBS = 2/)
  })

  it('A1 TimelineAudioTrack enables lazyPeaks in cut timeline', () => {
    const timeline = readFileSync(join(__dirname, '../components/cut-timeline.tsx'), 'utf8')
    expect(timeline).toMatch(/label="Source Audio · Voice"[\s\S]*lazyPeaks/)
    expect(timeline).toMatch(/mixPeaksByMediaId/)
  })
})
