'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Text } from '@msqdx/ui'
import { useJogShuttle } from '@/lib/use-jog-shuttle'

type EditorMonitorProps = {
  label: string
  videoRef?: RefObject<HTMLVideoElement | null>
  playbackUrl: string | null
  frameMs?: number
  disabled?: boolean
  onSeekDelta?: (deltaMs: number) => void
  hud?: ReactNode
  children?: ReactNode
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}

export function EditorMonitor({
  label,
  videoRef,
  playbackUrl,
  frameMs = 40,
  disabled = false,
  onSeekDelta,
  hud,
  children,
}: EditorMonitorProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const seekDelta = useCallback(
    (deltaMs: number) => {
      if (disabled) return
      onSeekDelta?.(deltaMs)
    },
    [disabled, onSeekDelta],
  )

  useJogShuttle(wrapRef, seekDelta, { enabled: Boolean(onSeekDelta) && !disabled, frameMs })

  const toggleFullscreen = useCallback(async () => {
    const node = wrapRef.current
    if (!node) return
    if (!document.fullscreenElement) {
      await node.requestFullscreen()
      setIsFullscreen(true)
    } else {
      await document.exitFullscreen()
      setIsFullscreen(false)
    }
  }, [])

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === wrapRef.current)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (disabled || isTypingTarget(event.target)) return
      if (event.key.toLowerCase() !== 'f' || event.metaKey || event.ctrlKey || event.altKey) return
      event.preventDefault()
      void toggleFullscreen()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [disabled, toggleFullscreen])

  return (
    <div ref={wrapRef} className={`videon-nle__monitor${isFullscreen ? ' is-fullscreen' : ''}`}>
      <div className="videon-nle__monitor-label">
        <span>{label}</span>
        <button
          type="button"
          className="videon-nle__monitor-fullscreen"
          onClick={() => void toggleFullscreen()}
          aria-label="Vollbild"
          title="Vollbild (F)"
        >
          ⛶
        </button>
      </div>
      <div className="videon-nle__player-wrap">
        {children ??
          (playbackUrl && videoRef ? (
            <video ref={videoRef} className="videon-nle__video" src={playbackUrl} playsInline preload="metadata" />
          ) : (
            <div className="videon-nle__video-placeholder">
              <Text role="body">Keine Wiedergabe</Text>
            </div>
          ))}
        {hud ? <div className="videon-nle__monitor-hud">{hud}</div> : null}
      </div>
    </div>
  )
}
