import { useEffect, useRef } from 'react'

export type CutBusAudioClip = {
  id: string
  mediaAssetId: string
  timelineStartMs: number
  startMs: number
  endMs: number
}

/**
 * Mix independent Cut bus clips against the program Cut playhead (not source video time).
 */
export function useCutBusAudioMixer(input: {
  cutPlayheadMs: number
  isPlaying: boolean
  clips: CutBusAudioClip[]
  playbackUrlByMediaId: Record<string, string>
  muted: boolean
  enabled?: boolean
}) {
  const { cutPlayheadMs, isPlaying, clips, playbackUrlByMediaId, muted, enabled = true } = input
  const playersRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const playheadRef = useRef(cutPlayheadMs)
  playheadRef.current = cutPlayheadMs

  useEffect(() => {
    if (!enabled) {
      for (const el of playersRef.current.values()) {
        el.pause()
        el.src = ''
      }
      playersRef.current.clear()
      return
    }

    const nextIds = new Set(clips.map((clip) => clip.id))
    for (const [id, el] of playersRef.current) {
      if (!nextIds.has(id)) {
        el.pause()
        el.src = ''
        playersRef.current.delete(id)
      }
    }

    for (const clip of clips) {
      const url = playbackUrlByMediaId[clip.mediaAssetId]
      if (!url) continue
      let el = playersRef.current.get(clip.id)
      if (!el) {
        el = new Audio(url)
        el.preload = 'auto'
        playersRef.current.set(clip.id, el)
      } else if (el.src !== url && !el.src.endsWith(url) && el.getAttribute('data-url') !== url) {
        el.src = url
      }
      el.setAttribute('data-url', url)
    }
  }, [clips, enabled, playbackUrlByMediaId])

  useEffect(() => {
    if (!enabled) return
    const playhead = playheadRef.current
    for (const clip of clips) {
      const el = playersRef.current.get(clip.id)
      if (!el) continue
      const duration = clip.endMs - clip.startMs
      const clipEnd = clip.timelineStartMs + duration
      const inRange = playhead >= clip.timelineStartMs && playhead < clipEnd
      if (muted || !inRange) {
        if (!el.paused) el.pause()
        continue
      }
      const sourceMs = clip.startMs + (playhead - clip.timelineStartMs)
      const targetSec = sourceMs / 1000
      if (Math.abs(el.currentTime - targetSec) > 0.12) {
        try {
          el.currentTime = targetSec
        } catch {
          /* ignore */
        }
      }
      if (isPlaying && el.paused) {
        void el.play().catch(() => {})
      } else if (!isPlaying && !el.paused) {
        el.pause()
      }
    }
  }, [clips, cutPlayheadMs, enabled, isPlaying, muted])

  useEffect(() => {
    return () => {
      for (const el of playersRef.current.values()) {
        el.pause()
        el.src = ''
      }
      playersRef.current.clear()
    }
  }, [])
}
