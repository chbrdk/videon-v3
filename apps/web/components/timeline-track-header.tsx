'use client'

export type TimelineTrackId = 'v1' | 'si' | 'a1' | 'a2' | 'tx'

export type TimelineTrackState = {
  hidden: boolean
  muted: boolean
}

export const DEFAULT_SOURCE_TRACK_STATE: Record<TimelineTrackId, TimelineTrackState> = {
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
}

/** Program monitor audio is muted when V1 or A1 mute is on (single HTMLVideoElement). */
export function programAudioMuted(tracks: {
  v1: Pick<TimelineTrackState, 'muted'>
  a1: Pick<TimelineTrackState, 'muted'>
}): boolean {
  return tracks.v1.muted || tracks.a1.muted
}

type TimelineTrackHeaderProps = {
  id: string
  label: string
  hidden: boolean
  muted: boolean
  variant?: 'default' | 'audio' | 'transcript' | 'insight'
  /** When true, mute is visual-only / unavailable (still toggles muted style). */
  muteHint?: string
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
