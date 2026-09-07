'use client'

import { TimelineClip, Waveform } from '@msqdx/ui'
import type { CutTimelineItem } from '@/lib/cut-timeline'
import { timelineLeftPx, timelineWidthPx } from '@/lib/timeline-layout'

type TimelineAudioTrackProps = {
  timeline: CutTimelineItem[]
  totalDurationMs: number
  msPerPixel: number
  peaksByUrl: Record<string, number[]>
  peaksByMediaId?: Record<string, number[]>
  playbackUrlByMediaId: Record<string, string>
  sourceDurationMsByMediaId: Record<string, number>
  clips: Array<{ scene: { mediaAssetId: string; startMs: number; endMs: number } }>
  label?: string
}

function samplePeaks(peaks: number[], targetBars: number): number[] {
  if (peaks.length === 0) return [0.15]
  const bars = Math.max(4, Math.min(targetBars, peaks.length))
  if (peaks.length <= bars) return [...peaks]
  const out: number[] = []
  for (let i = 0; i < bars; i += 1) {
    const start = Math.floor((i / bars) * peaks.length)
    const end = Math.max(start + 1, Math.floor(((i + 1) / bars) * peaks.length))
    let max = 0
    for (let j = start; j < end; j += 1) {
      max = Math.max(max, Math.abs(peaks[j] ?? 0))
    }
    out.push(max)
  }
  return out
}

export function TimelineAudioTrack({
  timeline,
  totalDurationMs,
  msPerPixel,
  peaksByUrl,
  peaksByMediaId = {},
  playbackUrlByMediaId,
  sourceDurationMsByMediaId,
  clips,
  label = 'Audio-Spur A1',
}: TimelineAudioTrackProps) {
  const contentWidthPx = Math.max(timelineLeftPx(totalDurationMs, msPerPixel), 1)

  return (
    <div className="videon-cut-timeline__audio-lane" aria-label={label}>
      {timeline.map((item) => {
        const clip = clips[item.index]
        if (!clip) return null
        const url = playbackUrlByMediaId[clip.scene.mediaAssetId]
        const peaks = peaksByMediaId[clip.scene.mediaAssetId] ?? (url ? peaksByUrl[url] : null)
        if (!peaks?.length) return null

        const leftPx = timelineLeftPx(item.cutStartMs, msPerPixel)
        const widthPx = timelineWidthPx(item.durationMs, msPerPixel)
        const sourceDuration = Math.max(
          sourceDurationMsByMediaId[clip.scene.mediaAssetId] ?? clip.scene.endMs,
          1,
        )
        const startIndex = Math.floor((clip.scene.startMs / sourceDuration) * peaks.length)
        const endIndex = Math.max(
          startIndex + 1,
          Math.floor((clip.scene.endMs / sourceDuration) * peaks.length),
        )
        const slice = peaks.slice(startIndex, endIndex)
        const targetBars = Math.max(4, Math.min(120, Math.round(widthPx / 2)))
        const sampled = samplePeaks(slice, targetBars)

        return (
          <TimelineClip
            key={`${item.scene.id}-audio`}
            leftPct={(leftPx / contentWidthPx) * 100}
            widthPct={(widthPx / contentWidthPx) * 100}
            tone="audio"
            className="videon-cut-timeline__clip videon-cut-timeline__clip--audio"
          >
            <Waveform peaks={sampled} height={28} aria-label={`${label} Clip ${item.index + 1}`} />
          </TimelineClip>
        )
      })}
    </div>
  )
}
