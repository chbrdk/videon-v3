'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { MediaMonitor, Text, ToolButton } from '@msqdx/ui'
import { useJogShuttle } from '@/lib/use-jog-shuttle'

type EditorMonitorProps = {
  /** Empty/omitted hides the chrome label row (fullscreen floats on the surface). */
  label?: string | null
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
  label = null,
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
  const bare = !label

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

  const fullscreenButton = (
    <ToolButton label="Vollbild" onClick={() => void toggleFullscreen()}>
      ⛶
    </ToolButton>
  )

  return (
    <div ref={wrapRef} className="videon-nle__monitor-host">
      <MediaMonitor
        className={`videon-nle__monitor${bare ? ' videon-nle__monitor--bare' : ''}`}
        label={label ?? ''}
        fullscreen={isFullscreen}
        actions={bare ? undefined : fullscreenButton}
        media={
          <>
            {children ??
              (playbackUrl && videoRef ? (
                <video ref={videoRef} className="videon-nle__video" src={playbackUrl} playsInline preload="metadata" />
              ) : (
                <div className="videon-nle__video-placeholder">
                  <Text role="body">Keine Wiedergabe</Text>
                </div>
              ))}
            {bare ? <div className="videon-nle__monitor-float-actions">{fullscreenButton}</div> : null}
          </>
        }
        hud={hud}
      />
    </div>
  )
}
