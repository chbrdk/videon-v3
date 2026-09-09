# Cut editor shortcuts

**Status:** Accepted — Cut NLE  
**Surface:** `CutEditorView` shortcuts overlay (`?`)  
**Related:** `cut-timeline-edit-ux.md` · `cut-timeline-edit-ux-wave2.md` · `videon-ui-surfaces.md`

## Purpose

Single catalog for Cut keyboard help so the overlay stays aligned with `useEditorKeyboard` / Wave 1–2 bindings.

## Requirements

1. WHEN the operator presses `?` (or the shortcuts ToolButton) THEN the Cut editor MUST show an overlay listing shortcuts from the typed catalog `CUT_EDITOR_SHORTCUTS` (`apps/web/lib/cut-editor-shortcuts.ts`).
2. WHEN the overlay renders THEN it MUST NOT hardcode key rows in JSX beyond mapping the catalog.
3. The catalog MUST include at least: Play/Pause, JKL shuttle, frame/seek, Select/Trim/U/R, Snap `N` / filter `Shift+N`, Fit `Z`/`Shift+Z`, zoom anchor `\`, selection `;` / `'`, Lock `Shift+L`, Link `Shift+A`, Mark I/O, Split `S`, Delete, Undo/Redo, Esc.
4. Gesture notes (pinch pan, Alt jog, minimap, marquee) MAY appear as catalog entries with empty or descriptive `keys`.
5. Media editor shortcuts remain separate (non-goal to unify).

## Acceptance

- Spec + unit: catalog contains `N`, `R`, `Shift+L`, `;`.
- Cut panel maps `CUT_EDITOR_SHORTCUTS`.
