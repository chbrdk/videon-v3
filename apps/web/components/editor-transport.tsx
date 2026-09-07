'use client'

import { Timecode, ToolButton, TransportBar } from '@msqdx/ui'
import { formatTimecode } from '@/lib/editor-time'
import {
  IconFrameBack,
  IconFrameForward,
  IconMarkIn,
  IconMarkOut,
  IconPause,
  IconPlay,
  IconSkipBack,
  IconSkipForward,
} from '@/components/editor-icons'

type EditorTransportProps = {
  currentMs: number
  durationMs: number
  frameRate?: number | null
  disabled?: boolean
  isPlaying?: boolean
  onTogglePlay: () => void
  onStepBack?: () => void
  onStepForward?: () => void
  onSeekBack?: () => void
  onSeekForward?: () => void
  onFrameBack?: () => void
  onFrameForward?: () => void
  markInMs?: number | null
  markOutMs?: number | null
  onMarkIn?: () => void
  onMarkOut?: () => void
  onClearMarks?: () => void
  showMarks?: boolean
}

export function EditorTransport({
  currentMs,
  durationMs,
  frameRate,
  disabled = false,
  isPlaying = false,
  onTogglePlay,
  onStepBack,
  onStepForward,
  onSeekBack,
  onSeekForward,
  onFrameBack,
  onFrameForward,
  markInMs = null,
  markOutMs = null,
  onMarkIn,
  onMarkOut,
  onClearMarks,
  showMarks = false,
}: EditorTransportProps) {
  return (
    <TransportBar
      className="videon-nle__transport"
      controls={
        <>
          {onStepBack ? (
            <ToolButton label="Vorheriger Clip" disabled={disabled} onClick={onStepBack}>
              <IconSkipBack />
            </ToolButton>
          ) : null}
          {onSeekBack ? (
            <ToolButton label="−1 Sekunde" disabled={disabled} onClick={onSeekBack}>
              <span className="videon-nle__transport-key">J</span>
            </ToolButton>
          ) : null}
          {onFrameBack ? (
            <ToolButton label="Frame zurück" disabled={disabled} onClick={onFrameBack}>
              <IconFrameBack />
            </ToolButton>
          ) : null}
          <ToolButton label={isPlaying ? 'Pause' : 'Play'} disabled={disabled} onClick={onTogglePlay}>
            {isPlaying ? <IconPause /> : <IconPlay />}
          </ToolButton>
          {onFrameForward ? (
            <ToolButton label="Frame vor" disabled={disabled} onClick={onFrameForward}>
              <IconFrameForward />
            </ToolButton>
          ) : null}
          {onSeekForward ? (
            <ToolButton label="+1 Sekunde" disabled={disabled} onClick={onSeekForward}>
              <span className="videon-nle__transport-key">L</span>
            </ToolButton>
          ) : null}
          {onStepForward ? (
            <ToolButton label="Nächster Clip" disabled={disabled} onClick={onStepForward}>
              <IconSkipForward />
            </ToolButton>
          ) : null}
        </>
      }
      timecode={
        <Timecode
          value={formatTimecode(currentMs, frameRate)}
          secondary={formatTimecode(durationMs, frameRate)}
        />
      }
      trailing={
        showMarks ? (
          <>
            {onMarkIn ? (
              <ToolButton
                label="In-Punkt setzen (I)"
                disabled={disabled}
                onClick={onMarkIn}
                active={markInMs !== null}
              >
                <IconMarkIn />
              </ToolButton>
            ) : null}
            {onMarkOut ? (
              <ToolButton
                label="Out-Punkt setzen (O)"
                disabled={disabled}
                onClick={onMarkOut}
                active={markOutMs !== null}
              >
                <IconMarkOut />
              </ToolButton>
            ) : null}
            {onClearMarks ? (
              <ToolButton
                label="Marken löschen"
                disabled={disabled || (markInMs === null && markOutMs === null)}
                onClick={onClearMarks}
              >
                ⌫
              </ToolButton>
            ) : null}
            <span className="videon-nle__mark-readout">
              {markInMs !== null || markOutMs !== null
                ? `In ${formatTimecode(markInMs ?? 0, frameRate)} · Out ${formatTimecode(markOutMs ?? durationMs, frameRate)}`
                : 'Keine In/Out-Marken'}
            </span>
          </>
        ) : null
      }
    />
  )
}
