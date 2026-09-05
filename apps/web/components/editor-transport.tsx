'use client'

import type { ReactNode } from 'react'
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

function TransportButton({
  label,
  disabled,
  onClick,
  children,
  active,
}: {
  label: string
  disabled?: boolean
  onClick?: () => void
  children: ReactNode
  active?: boolean
}) {
  return (
    <button
      type="button"
      className={`videon-nle__transport-btn${active ? ' is-active' : ''}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
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
    <div className="videon-nle__transport">
      <div className="videon-nle__transport-group">
        {onStepBack ? (
          <TransportButton label="Vorheriger Clip" disabled={disabled} onClick={onStepBack}>
            <IconSkipBack />
          </TransportButton>
        ) : null}
        {onSeekBack ? (
          <TransportButton label="−1 Sekunde" disabled={disabled} onClick={onSeekBack}>
            <span className="videon-nle__transport-key">J</span>
          </TransportButton>
        ) : null}
        {onFrameBack ? (
          <TransportButton label="Frame zurück" disabled={disabled} onClick={onFrameBack}>
            <IconFrameBack />
          </TransportButton>
        ) : null}
        <TransportButton label={isPlaying ? 'Pause' : 'Play'} disabled={disabled} onClick={onTogglePlay}>
          {isPlaying ? <IconPause /> : <IconPlay />}
        </TransportButton>
        {onFrameForward ? (
          <TransportButton label="Frame vor" disabled={disabled} onClick={onFrameForward}>
            <IconFrameForward />
          </TransportButton>
        ) : null}
        {onSeekForward ? (
          <TransportButton label="+1 Sekunde" disabled={disabled} onClick={onSeekForward}>
            <span className="videon-nle__transport-key">L</span>
          </TransportButton>
        ) : null}
        {onStepForward ? (
          <TransportButton label="Nächster Clip" disabled={disabled} onClick={onStepForward}>
            <IconSkipForward />
          </TransportButton>
        ) : null}
      </div>

      <div className="videon-nle__timecode" aria-live="polite">
        <span className="videon-nle__timecode-current">{formatTimecode(currentMs, frameRate)}</span>
        <span className="videon-nle__timecode-sep">/</span>
        <span className="videon-nle__timecode-duration">{formatTimecode(durationMs, frameRate)}</span>
      </div>

      {showMarks ? (
        <div className="videon-nle__transport-group videon-nle__transport-group--marks">
          {onMarkIn ? (
            <TransportButton label="In-Punkt setzen (I)" disabled={disabled} onClick={onMarkIn} active={markInMs !== null}>
              <IconMarkIn />
            </TransportButton>
          ) : null}
          {onMarkOut ? (
            <TransportButton label="Out-Punkt setzen (O)" disabled={disabled} onClick={onMarkOut} active={markOutMs !== null}>
              <IconMarkOut />
            </TransportButton>
          ) : null}
          {onClearMarks ? (
            <button type="button" className="videon-nle__transport-text" disabled={disabled || (markInMs === null && markOutMs === null)} onClick={onClearMarks}>
              Marken löschen
            </button>
          ) : null}
          <span className="videon-nle__mark-readout">
            {markInMs !== null || markOutMs !== null
              ? `In ${formatTimecode(markInMs ?? 0, frameRate)} · Out ${formatTimecode(markOutMs ?? durationMs, frameRate)}`
              : 'Keine In/Out-Marken'}
          </span>
        </div>
      ) : null}
    </div>
  )
}
