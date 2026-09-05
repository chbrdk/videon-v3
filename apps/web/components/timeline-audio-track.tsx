'use client'

import { useEffect, useRef } from 'react'
import type { CutTimelineItem } from '@/lib/cut-timeline'
import { timelineLeftPx, timelineWidthPx } from '@/lib/timeline-layout'

type TimelineAudioTrackProps = {
  timeline: CutTimelineItem[]
  totalDurationMs: number
  msPerPixel: number
  peaksByUrl: Record<string, number[]>
  playbackUrlByMediaId: Record<string, string>
  sourceDurationMsByMediaId: Record<string, number>
  clips: Array<{ scene: { mediaAssetId: string; startMs: number; endMs: number } }>
}

export function TimelineAudioTrack({
  timeline,
  totalDurationMs,
  msPerPixel,
  peaksByUrl,
  playbackUrlByMediaId,
  sourceDurationMsByMediaId,
  clips,
}: TimelineAudioTrackProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || totalDurationMs <= 0) return
    const context = canvas.getContext('2d')
    if (!context) return
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width <= 0 || height <= 0) return
    canvas.width = width * window.devicePixelRatio
    canvas.height = height * window.devicePixelRatio
    context.scale(window.devicePixelRatio, window.devicePixelRatio)
    context.clearRect(0, 0, width, height)
    context.fillStyle = '#2d6a9f'

    for (const item of timeline) {
      const clip = clips[item.index]
      if (!clip) continue
      const url = playbackUrlByMediaId[clip.scene.mediaAssetId]
      const peaks = url ? peaksByUrl[url] : null
      if (!peaks?.length) continue

      const left = timelineLeftPx(item.cutStartMs, msPerPixel)
      const clipWidth = timelineWidthPx(item.durationMs, msPerPixel)
      const sourceDuration = Math.max(
        sourceDurationMsByMediaId[clip.scene.mediaAssetId] ?? clip.scene.endMs,
        1,
      )
      const startIndex = Math.floor((clip.scene.startMs / sourceDuration) * peaks.length)
      const endIndex = Math.max(startIndex + 1, Math.floor((clip.scene.endMs / sourceDuration) * peaks.length))
      const slice = peaks.slice(startIndex, endIndex)
      const peakCount = Math.max(slice.length, 4)

      const mid = height / 2
      for (let index = 0; index < peakCount; index += 1) {
        const peak = slice[Math.min(index, slice.length - 1)] ?? 0
        const x = left + (index / peakCount) * clipWidth
        const barWidth = Math.max(clipWidth / peakCount, 1)
        const barHeight = Math.max(peak * (height - 4), 1)
        context.fillRect(x, mid - barHeight / 2, barWidth, barHeight)
      }
    }
  }, [clips, msPerPixel, peaksByUrl, playbackUrlByMediaId, sourceDurationMsByMediaId, timeline, totalDurationMs])

  return <canvas ref={canvasRef} className="videon-cut-timeline__audio-canvas" aria-label="Audio-Spur A1" />
}
