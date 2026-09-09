'use client'

export type TimelineTrackId = 'v1' | 'v2' | 'si' | 'a1' | 'a2' | 'ab' | 'tx' | 'v2a1' | 'v2a2' | 'v2tx'

export type TimelineTrackState = {
  hidden: boolean
  muted: boolean
}

export const DEFAULT_SOURCE_TRACK_STATE: Record<Exclude<TimelineTrackId, 'ab' | 'v2' | 'v2a1' | 'v2a2' | 'v2tx'>, TimelineTrackState> = {
  v1: { hidden: false, muted: false },
  si: { hidden: false, muted: false },
  a1: { hidden: false, muted: false },
  a2: { hidden: false, muted: false },
  tx: { hidden: false, muted: false },
}

export const DEFAULT_CUT_TRACK_STATE: Record<Exclude<TimelineTrackId, 'si'>, TimelineTrackState> = {
  v1: { hidden: false, muted: false },
  a1: { hidden: false, muted: false },
  a2: { hidden: false, muted: false },
  tx: { hidden: false, muted: false },
  v2: { hidden: false, muted: false },
  v2a1: { hidden: false, muted: false },
  v2a2: { hidden: false, muted: false },
  v2tx: { hidden: false, muted: false },
  ab: { hidden: false, muted: false },
}

type TimelineTrackHeaderProps = {
  id: string
  label: string
  hidden: boolean
  muted: boolean
  variant?: 'default' | 'audio' | 'transcript' | 'insight'
  /** When true, mute is visual-only / unavailable (still toggles muted style). */
  muteHint?: string
  /** Optional stem/media download URL (same-origin; uses session cookie). */
  downloadHref?: string | null
  downloadLabel?: string
  onToggleHidden: () => void
  onToggleMuted: () => void
}

export function TimelineTrackHeader({
  id,
  label,
  hidden,
  muted,
  variant = 'default',
  muteHint,
  downloadHref,
  downloadLabel,
  onToggleHidden,
  onToggleMuted,
}: TimelineTrackHeaderProps) {
  const variantClass =
    variant === 'audio'
      ? ' videon-cut-timeline__header-label--audio'
      : variant === 'transcript'
        ? ' videon-cut-timeline__header-label--transcript'
        : variant === 'insight'
          ? ' videon-cut-timeline__header-label--insight'
          : ''

  return (
    <div
      className={`videon-cut-timeline__header-label${variantClass}${hidden ? ' is-collapsed' : ''}${muted ? ' is-muted' : ''}`}
      data-track={id}
    >
      <span className="videon-cut-timeline__header-name">{label}</span>
      <span className="videon-cut-timeline__header-actions">
        {downloadHref ? (
          <a
            className="videon-cut-timeline__track-btn videon-cut-timeline__track-btn--link"
            href={downloadHref}
            download
            title={downloadLabel ?? `${label} herunterladen`}
            aria-label={downloadLabel ?? `${label} als WAV herunterladen`}
            onClick={(event) => event.stopPropagation()}
          >
            ↓
          </a>
        ) : null}
        <button
          type="button"
          className={`videon-cut-timeline__track-btn${hidden ? ' is-active' : ''}`}
          aria-pressed={hidden}
          aria-label={hidden ? `${label} einblenden` : `${label} ausblenden`}
          title={hidden ? 'Einblenden' : 'Ausblenden'}
          onClick={(event) => {
            event.stopPropagation()
            onToggleHidden()
          }}
        >
          {hidden ? '◌' : '◉'}
        </button>
        <button
          type="button"
          className={`videon-cut-timeline__track-btn${muted ? ' is-active' : ''}`}
          aria-pressed={muted}
          aria-label={muted ? `${label} Ton an` : `${label} stummschalten`}
          title={muteHint ?? (muted ? 'Ton an' : 'Stumm')}
          onClick={(event) => {
            event.stopPropagation()
            onToggleMuted()
          }}
        >
          {muted ? 'M' : '♪'}
        </button>
      </span>
    </div>
  )
}
