/**
 * Pure builders for source-timeline context menus — specs/domain/timeline-context-menu.md
 */

export type TimelineContextTarget =
  | { kind: 'scene'; sceneKey: string; startMs: number; endMs: number }
  | { kind: 'transcript'; startMs: number; endMs: number; index: number }
  | { kind: 'lane'; atMs: number }

export type TimelineContextMenuRequest = TimelineContextTarget & {
  clientX: number
  clientY: number
}

export type TimelineContextIconKey =
  | 'inspect'
  | 'seek'
  | 'markIn'
  | 'markOut'
  | 'clearMarks'
  | 'cut'
  | 'transcript'
  | 'export'
  | 'comment'

export type TimelineContextDraftItem = {
  id: string
  label: string
  disabled?: boolean
  separator?: boolean
  section?: boolean
  danger?: boolean
  iconKey?: TimelineContextIconKey
}

export function buildTimelineContextMenuDraft(
  target: TimelineContextTarget,
  options: { hasMarks: boolean } = { hasMarks: false },
): TimelineContextDraftItem[] {
  if (target.kind === 'scene') {
    return [
      { id: 'section-scene', label: 'Szene', section: true },
      { id: 'open-scene-inspect', label: 'Szenen-Infos öffnen', iconKey: 'inspect' },
      { id: 'seek-scene', label: 'Zur Szene springen', iconKey: 'seek' },
      {
        id: 'marks-from-scene',
        label: 'In/Out auf Szene setzen',
        iconKey: 'markIn',
        separator: true,
      },
      { id: 'cut-from-scene', label: 'Szene als Cut', iconKey: 'cut' },
      {
        id: 'export-scene',
        label: 'Szene exportieren',
        iconKey: 'export',
        disabled: true,
        separator: true,
      },
      { id: 'add-comment', label: 'Kommentar hinzufügen', iconKey: 'comment', disabled: true },
    ]
  }

  if (target.kind === 'transcript') {
    return [
      { id: 'section-tx', label: 'Transkript', section: true },
      { id: 'seek-transcript', label: 'Hierher springen', iconKey: 'seek' },
      { id: 'open-transcript', label: 'Transkript öffnen', iconKey: 'transcript' },
    ]
  }

  const laneItems: TimelineContextDraftItem[] = [
    { id: 'section-lane', label: 'Timeline', section: true },
    { id: 'seek-here', label: 'Hierher springen', iconKey: 'seek' },
    { id: 'mark-in-here', label: 'In hier setzen', iconKey: 'markIn', separator: true },
    { id: 'mark-out-here', label: 'Out hier setzen', iconKey: 'markOut' },
  ]
  if (options.hasMarks) {
    laneItems.push({
      id: 'clear-marks',
      label: 'Markierungen löschen',
      iconKey: 'clearMarks',
      separator: true,
      danger: true,
    })
  }
  return laneItems
}

/** Clamp fixed menu position so it stays on-screen with an 8px inset. */
export function clampContextMenuPosition(
  x: number,
  y: number,
  viewport: { width: number; height: number } = {
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 720,
  },
  menuSize: { width: number; height: number } = { width: 220, height: 280 },
): { x: number; y: number } {
  const pad = 8
  const maxX = Math.max(pad, viewport.width - menuSize.width - pad)
  const maxY = Math.max(pad, viewport.height - menuSize.height - pad)
  return {
    x: Math.min(Math.max(x, pad), maxX),
    y: Math.min(Math.max(y, pad), maxY),
  }
}

export function timelineMsFromClientX(input: {
  clientX: number
  lanesLeft: number
  contentWidthPx: number
  msPerPixel: number
  durationMs: number
}): number {
  const x = Math.min(Math.max(input.clientX - input.lanesLeft, 0), input.contentWidthPx)
  return Math.min(Math.max(Math.floor(x * input.msPerPixel), 0), Math.max(input.durationMs, 0))
}
