'use client'

import { useEffect, useMemo, useState } from 'react'
import { TimelineClip, Waveform } from '@msqdx/ui'
import type { CutTimelineItem } from '@/lib/cut-timeline'
import { timelineLeftPx, timelineWidthPx } from '@/lib/timeline-layout'
import { prefetchWaveformPeaks } from '@/lib/use-waveform'
import { useInViewOnce } from '@/lib/use-in-view'
import { downsamplePeaks } from '@/lib/waveform-lod'

type TimelineAudioTrackProps = {
  timeline: CutTimelineItem[]
  totalDurationMs: number
  msPerPixel: number
  peaksByUrl: Record<string, number[]>
  peaksByMediaId?: Record<string, number[]>
  /** Mix/original peaks when stem voice peaks are absent (A1 fallback). */
  mixPeaksByMediaId?: Record<string, number[]>
  playbackUrlByMediaId: Record<string, string>
  sourceDurationMsByMediaId: Record<string, number>
  clips: Array<{ scene: { mediaAssetId: string; startMs: number; endMs: number } }>
  label?: string
  /** When true, decode stream peaks only after the lane is near the viewport. */
  lazyPeaks?: boolean
}

export function TimelineAudioTrack({
  timeline,
  totalDurationMs,
  msPerPixel,
  peaksByUrl,
  peaksByMediaId = {},
  mixPeaksByMediaId = {},
  playbackUrlByMediaId,
  sourceDurationMsByMediaId,
  clips,
  label = 'Audio-Spur A1',
  lazyPeaks = false,
}: TimelineAudioTrackProps) {
  const contentWidthPx = Math.max(timelineLeftPx(totalDurationMs, msPerPixel), 1)
  const [laneRef, inView] = useInViewOnce<HTMLDivElement>({
    enabled: lazyPeaks,
    rootMargin: '200px 0px',
  })
  const [localPeaksByUrl, setLocalPeaksByUrl] = useState<Record<string, number[]>>({})

  const urlsNeeded = useMemo(() => {
    const urls = new Set<string>()
    for (const item of timeline) {
      const mediaId = item.scene.mediaAssetId
      if (peaksByMediaId[mediaId]?.length || mixPeaksByMediaId[mediaId]?.length) continue
      const url = playbackUrlByMediaId[mediaId]
      if (url) urls.add(url)
    }
    return [...urls]
  }, [timeline, mixPeaksByMediaId, peaksByMediaId, playbackUrlByMediaId])

  useEffect(() => {
    if (lazyPeaks && !inView) return
    let cancelled = false
    const run = () => {
      for (const url of urlsNeeded) {
        if (peaksByUrl[url]?.length) continue
        void prefetchWaveformPeaks(url)
          .then((peaks) => {
            if (cancelled || !peaks.length) return
            setLocalPeaksByUrl((prev) => (prev[url] ? prev : { ...prev, [url]: peaks }))
          })
          .catch(() => {})
      }
    }
    // Even when the lane is visible, wait for idle so open critical path stays free.
    if (lazyPeaks) {
      const idle = typeof window !== 'undefined' ? window.requestIdleCallback : undefined
      if (typeof idle === 'function') {
        const idleId = idle(run, { timeout: 2500 })
        return () => {
          cancelled = true
          window.cancelIdleCallback?.(idleId)
        }
      }
      const timer = globalThis.setTimeout(run, 400)
      return () => {
        cancelled = true
        globalThis.clearTimeout(timer)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [inView, lazyPeaks, peaksByUrl, urlsNeeded])

  return (
    <div ref={laneRef} className="videon-cut-timeline__audio-lane" aria-label={label}>
      {timeline.map((item) => {
        const mediaAssetId = item.scene.mediaAssetId
        const startMs = item.scene.startMs
        const endMs = item.scene.endMs
        const url = playbackUrlByMediaId[mediaAssetId]
        const peaks =
          peaksByMediaId[mediaAssetId] ??
          mixPeaksByMediaId[mediaAssetId] ??
          (url ? localPeaksByUrl[url] ?? peaksByUrl[url] : null)
        if (!peaks?.length) return null

        const leftPx = timelineLeftPx(item.cutStartMs, msPerPixel)
        const widthPx = timelineWidthPx(item.durationMs, msPerPixel)
        const sourceDuration = Math.max(sourceDurationMsByMediaId[mediaAssetId] ?? endMs, 1)
        const startIndex = Math.floor((startMs / sourceDuration) * peaks.length)
        const endIndex = Math.max(
          startIndex + 1,
          Math.floor((endMs / sourceDuration) * peaks.length),
        )
        const slice = peaks.slice(startIndex, endIndex)
        const targetBars = Math.max(4, Math.min(120, Math.round(widthPx / 2)))
        const sampled = downsamplePeaks(slice, targetBars)

        return (
          <TimelineClip
            key={`${item.scene.id}-audio`}
            leftPct={(leftPx / contentWidthPx) * 100}
            widthPct={(widthPx / contentWidthPx) * 100}
            tone="audio"
            className="videon-cut-timeline__clip videon-cut-timeline__clip--audio"
          >
            <Waveform peaks={sampled} height={36} className="videon-cut-timeline__audio-canvas" />
          </TimelineClip>
        )
      })}
    </div>
  )
}
