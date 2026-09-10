# Cut timeline edit UX

**Status:** Accepted — Cut sequence timeline  
**Surface:** `CutTimeline` / `CutEditorView`  
**Related:** `videon-ui-surfaces.md` (Timeline DS shell) · `cut-multi-track.md` · `timeline-context-menu.md`

## Purpose

Editor-grade Cut timeline interaction: magnet snap with toggle, trackpad pan inertia, zoom-to-fit, clip nudge, multi-select group move, and trim-edge precue — without inventing a beat/marker track.

## Snap targets

1. WHEN the operator moves or edge-trims a clip AND snap is enabled THEN the edit edge MUST magnet-snap to nearby foreign edges within a **pixel** threshold (~10 px via `msPerPixel`):
   - V1 clip edges
   - V2 clip edges
   - Audio-bus (VO) clip edges
   - Playhead
   - Sequence end (`totalDurationMs`)
   - Ephemeral Cut Mark In / Mark Out when set
2. WHEN snapping THEN edges of the active clip (and of every clip in a multi-drag selection) MUST be excluded.
3. WHILE snapped THEN the timeline MUST show a vertical snap guide at that time.
4. WHEN snap is disabled (`N` or magnet toolbar) THEN move/trim/drop/seek MUST use raw times and MUST NOT show a snap guide.
5. `S` remains Split. Snap toggle MUST use **`N`** (plus magnet `ToolButton`).

## Cut marks

6. WHEN the operator presses `I` / `O` on the Cut editor THEN ephemeral Mark In / Mark Out MUST be set to the current Cut playhead (same keyboard handlers as media editor).
7. WHEN marks are set THEN the ruler MAY show In/Out markers; snap MUST include those times.

## Viewport gestures

8. WHEN the operator pans **horizontally** (trackpad deltaX dominant, mouse horizontal wheel, or Shift+wheel) THEN after the gesture ends the viewport MAY continue with decaying momentum on `scrollLeft`; pinch/ctrl zoom and Alt+jog MUST cancel inertia and MUST NOT add momentum.
8a. WHEN the operator uses **plain vertical** wheel / trackpad THEN the viewport MUST scroll the track stack (`scrollTop`) and MUST NOT convert that gesture into time pan.
9. WHEN the operator double-clicks the ruler OR presses `Shift+Z` THEN zoom MUST Fit All (largest stepped zoom that fits `totalDurationMs` in the viewport width; else minimum zoom).
10. WHEN the operator presses `Z` THEN zoom MUST Fit Selection span when a selection exists; otherwise Fit All. After fit, scroll SHOULD keep the fitted range in view.

## Nudge

11. WHEN the operator presses `Alt+←/→` THEN selected clip(s) (fallback: active V1) MUST nudge by ±1 frame.
12. WHEN the operator presses `Alt+Shift+←/→` THEN the same set MUST nudge by ±1 second.
13. Nudge MUST call existing move APIs (`moveScene` / `moveVideoClip` / `moveAudioClip`) with snap applied when enabled. Plain arrows remain clip-step / seek.

## Multi-select + group move

14. Selection is a list of `{ lane: v1|v2|audio, id }` with primary = last added.
15. Click without modifiers replaces selection. Cmd/Ctrl+click toggles. Shift+click expands a range on the **same lane** by timeline order.
16. WHEN the operator body-drags a selected clip THEN all selected clips on that lane MUST move by the same Δt (horizontal only; no cross-lane group move). Snap uses the primary clip’s leading edge; all selected edges are excluded.
17. Selected clips MUST render `is-selected` (in addition to active/primary chrome).

## Trim precue

18. WHILE the operator edge-trims V1 or V2 THEN the Cut playhead MUST seek to the active trim edge so the program monitor follows (no separate audio-only scrub bus).

## Non-goals

- Continuous (non-step) zoom scale
- Beat / marker track
- Batch move API
- Cross-lane group move
- Remapping Split off `S`
- Dedicated trim-audio-only scrub

## Acceptance

- Spec + unit tests for snap targets (audio/marks/end/exclude-set), fit zoom index, selection range, nudge delta, inertia decay helper.
- Smoke: Cut timeline binds snap toggle (`N`), multi-select, fit, trim precue seek; `S` is not snap.
- Typecheck + vitest green.
