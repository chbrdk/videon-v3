export type CutEditorShortcut = {
  /** Display keys, e.g. "N" or "Shift+L". Empty for gesture-only rows. */
  keys: string
  action: string
}

/** SSOT for Cut shortcuts overlay — specs/domain/cut-editor-shortcuts.md */
export const CUT_EDITOR_SHORTCUTS: readonly CutEditorShortcut[] = [
  { keys: 'Space / K', action: 'Play/Pause' },
  { keys: 'Hold J / L', action: 'Shuttle (rate ramp); K stops' },
  { keys: ', / .', action: 'Frame step' },
  { keys: 'Shift+← / →', action: 'Seek ±1 s' },
  { keys: 'Alt+← / →', action: 'Nudge selected clip(s) ±1 frame' },
  { keys: 'Alt+Shift+← / →', action: 'Nudge selected clip(s) ±1 s' },
  { keys: 'A', action: 'Select tool' },
  { keys: 'T', action: 'Trim tool' },
  { keys: 'U', action: 'Cycle Slip / Resize / Roll' },
  { keys: 'R', action: 'Toggle ripple edit' },
  { keys: 'N', action: 'Toggle snap' },
  { keys: 'Shift+N', action: 'Cycle snap filter' },
  { keys: '\\', action: 'Toggle zoom anchor (cursor / playhead)' },
  { keys: 'Z / Shift+Z', action: 'Fit selection / Fit all' },
  { keys: ';', action: 'Seek playhead to selection start' },
  { keys: "'", action: 'Move selection to playhead' },
  { keys: 'Shift+L', action: 'Toggle clip lock' },
  { keys: 'Shift+A', action: 'Toggle linked audio highlight' },
  { keys: 'I / O', action: 'Mark In / Out' },
  { keys: 'S', action: 'Split at playhead' },
  { keys: '⌫', action: 'Delete clip' },
  { keys: '⌘Z / ⌘⇧Z', action: 'Undo / Redo' },
  { keys: 'F', action: 'Fullscreen monitor' },
  { keys: '?', action: 'Toggle this help' },
  { keys: 'Esc', action: 'Close menus / overlay' },
  { keys: '', action: 'Pinch zoom · horizontal swipe/Shift+wheel pans time · vertical scroll moves tracks · Alt+wheel jog' },
  { keys: '', action: 'Minimap: click seek · drag window pan · Marquee on V1/V2/VO' },
]

export function cutShortcutCatalogHasKey(needle: string): boolean {
  const n = needle.toLowerCase()
  return CUT_EDITOR_SHORTCUTS.some((row) => row.keys.toLowerCase().includes(n))
}
