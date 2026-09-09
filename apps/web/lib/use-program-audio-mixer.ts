import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

export type ProgramTrackMutes = {
  v1: boolean
  /** V2 video overlay mute (hides overlay; V1 remains). */
  v2?: boolean
  a1: boolean
  a2: boolean
  /** V2 companion Source Audio mutes (lane-aware when V2 wins). */
  v2a1?: boolean
  v2a2?: boolean
  /** Extra Cut audio bus (Voice-Over); optional for source editor. */
  ab?: boolean
}

const DRIFT_SEC = 0.12

function syncElement(el: HTMLMediaElement | null, video: HTMLVideoElement, muted: boolean) {
  if (!el) return
  el.muted = muted
  const target = video.currentTime
  if (Number.isFinite(target) && Math.abs(el.currentTime - target) > DRIFT_SEC) {
    try {
      el.currentTime = target
    } catch {
      /* ignore seek before ready */
    }
  }
  if (video.paused) {
    if (!el.paused) el.pause()
    return
  }
  if (el.paused && !muted) {
    void el.play().catch(() => {})
  }
}

/**
 * When stem URLs exist: video bus stays muted (split-out original); A1/A2 drive stem players.
 * Without stems: V1 or A1 mute the single `<video>` audio bus.
 */
export function useProgramAudioMixer(input: {
  videoRef: RefObject<HTMLVideoElement | null>
  voiceUrl: string | null
  musicUrl: string | null
  mutes: ProgramTrackMutes
  enabled?: boolean
}) {
  const { videoRef, voiceUrl, musicUrl, mutes, enabled = true } = input
  const voiceRef = useRef<HTMLAudioElement | null>(null)
  const musicRef = useRef<HTMLAudioElement | null>(null)
  const mutesRef = useRef(mutes)
  mutesRef.current = mutes

  const hasStems = Boolean(voiceUrl || musicUrl)

  useEffect(() => {
    if (!enabled) return
    const voice = voiceUrl ? new Audio(voiceUrl) : null
    const music = musicUrl ? new Audio(musicUrl) : null
    if (voice) {
      voice.preload = 'auto'
      voiceRef.current = voice
    } else {
      voiceRef.current = null
    }
    if (music) {
      music.preload = 'auto'
      musicRef.current = music
    } else {
      musicRef.current = null
    }
    return () => {
      voice?.pause()
      music?.pause()
      if (voice) voice.src = ''
      if (music) music.src = ''
      voiceRef.current = null
      musicRef.current = null
    }
  }, [enabled, voiceUrl, musicUrl])

  useEffect(() => {
    if (!enabled) return
    const video = videoRef.current
    if (!video) return

    const apply = () => {
      const { v1, a1, a2 } = mutesRef.current
      if (hasStems) {
        // Original mix is split out — never hear it under stem playback.
        video.muted = true
        syncElement(voiceRef.current, video, a1)
        syncElement(musicRef.current, video, a2)
        return
      }
      video.muted = v1 || a1
      voiceRef.current?.pause()
      musicRef.current?.pause()
    }

    apply()
    const onPlay = () => apply()
    const onPause = () => {
      voiceRef.current?.pause()
      musicRef.current?.pause()
    }
    const onSeeked = () => apply()
    const onTime = () => {
      if (!hasStems) return
      const { a1, a2 } = mutesRef.current
      syncElement(voiceRef.current, video, a1)
      syncElement(musicRef.current, video, a2)
    }

    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('timeupdate', onTime)
    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('timeupdate', onTime)
    }
  }, [enabled, hasStems, videoRef, mutes.v1, mutes.a1, mutes.a2, voiceUrl, musicUrl])

  return { hasStems }
}

export function programAudioMuted(mutes: Pick<ProgramTrackMutes, 'v1' | 'a1'>, hasStems: boolean): boolean {
  if (hasStems) return true
  return mutes.v1 || mutes.a1
}
