/**
 * Cut timeline context menu — specs/domain/timeline-context-menu.md Phase 2
 */

export type CutTimelineContextTarget =
  | {
      kind: 'cut-clip'
      sceneId: string
      index: number
      cutStartMs: number
      cutEndMs: number
      canMerge: boolean
      canDelete: boolean
      canSplit: boolean
    }
  | { kind: 'cut-lane'; atMs: number }

export type CutTimelineContextMenuRequest = CutTimelineContextTarget & {
  clientX: number
  clientY: number
}

export type CutTimelineContextDraftItem = {
  id: string
  label: string
  disabled?: boolean
  separator?: boolean
  section?: boolean
  danger?: boolean
}

export function buildCutTimelineContextMenuDraft(
  target: CutTimelineContextTarget,
): CutTimelineContextDraftItem[] {
  if (target.kind === 'cut-clip') {
    return [
      { id: 'section-clip', label: 'Clip', section: true },
      { id: 'inspect-clip', label: 'Clip prüfen' },
      { id: 'seek-clip-start', label: 'Zur Clip-Start', separator: true },
      { id: 'split-at-playhead', label: 'An Playhead teilen', disabled: !target.canSplit },
      { id: 'merge-next', label: 'Mit nächstem verbinden', disabled: !target.canMerge },
      {
        id: 'delete-clip',
        label: 'Löschen',
        danger: true,
        disabled: !target.canDelete,
        separator: true,
      },
    ]
  }

  return [
    { id: 'section-lane', label: 'Timeline', section: true },
    { id: 'seek-here', label: 'Hierher springen' },
  ]
}
