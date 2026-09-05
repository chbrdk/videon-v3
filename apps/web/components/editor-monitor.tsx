'use client'

import { useCallback, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Text } from '@msqdx/ui'
import { useJogShuttle } from '@/lib/use-jog-shuttle'

type EditorMonitorProps = {
  label: string
  videoRef?: RefObject<HTMLVideoElement | null>
  playbackUrl: string | null
  frameMs?: number
  disabled?: boolean
  onSeekDelta?: (deltaMs: number) => void
  children?: ReactNode
}

export function EditorMonitor({
  label,
  videoRef,
  playbackUrl,
  frameMs = 40,
  disabled = false,
  onSeekDelta,
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

  const toggleFullscreen = async () => {
    const node = wrapRef.current
    if (!node) return
    if (!document.fullscreenElement) {
      await node.requestFullscreen()
      setIsFullscreen(true)
    } else {
      await document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

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
      </div>
    </div>
  )
}
