# Cut timeline edit UX — Wave 2

**Status:** Accepted — Cut sequence timeline  
**Surface:** `CutTimeline` / `CutEditorView`  
**Related:** `cut-timeline-edit-ux.md` · `videon-ui-surfaces.md` · `specs/api/cuts.md` (`moveClips`)

## Purpose

Second edit-UX wave: ripple edit, tool/mode hotkeys, snap filter, playhead navigation, minimap, zoom anchor, audio trim, waveform LOD, JKL shuttle, marquee, clip lock, linked highlight, undo-grouped batch moves, viewport culling.

## Tools and modes

1. WHEN the operator presses **`A`** THEN the timeline tool MUST be **Select** (body drag allowed).
2. WHEN the operator presses **`T`** THEN the tool MUST be **Trim** (body drag disabled; edge handles only).
3. WHEN the operator presses **`U`** THEN `TrimMode` MUST cycle `trim` → `ripple` → `roll`.
4. WHEN the operator presses **`R`** THEN **ripple edit** MUST toggle. WHILE ripple is on:
   - nudge / group-move / `moveClips` MUST shift later same-lane clips by Δt;
   - delete MUST close the gap by shifting later same-lane clips left;
   - **Resize** edge commits MUST shift later same-lane clips by Δend (`cut-timeline-edit-ux-wave5.md`).
5. WHEN ripple is off THEN free-arrange overlaps remain allowed (Wave 1 behavior).

## Snap filter

6. WHEN the operator presses **`Shift+N`** THEN snap filter MUST cycle `all` → `clips` → `playhead` → `marks`.
7. Snap points MUST respect the active filter; `N` still toggles snap on/off.

## Navigation

8. **`;`** MUST seek the playhead to the selection span start (fallback: active clip start).
9. **`'`** MUST move the primary selected clip’s timeline start to the playhead (snap when enabled).
10. `usePlayheadFollow` MUST run only WHILE playing.
11. **`\\`** MUST toggle zoom anchor between `cursor` and `playhead` for pinch/ctrl zoom.
12. A minimap under the viewport MUST show sequence overview, playhead, selection, and a viewport window; click seeks; drag window pans.

## Audio trim / waveform

13. VO bus clips MUST expose edge handles calling `trimAudioClip` (optional `timelineStartMs` on start-edge) with the same pixel snap rules.
14. Stem/bus waveforms MUST size with timeline `msPerPixel` / clip width and MAY downsample peaks (LOD) for display.

## Shuttle / selection chrome

15. Hold **J/L** MUST escalate shuttle rate (±2/±4/±8)× frame step; **K** stops. Program monitor MUST show the rate badge. Plain tap J/L remains coarse seek when not held long.
16. Empty-lane pointer drag MUST marquee-select intersecting clips on that lane (Shift = additive).
17. **`Shift+L`** MUST toggle lock on the current selection. Locked clips MUST ignore move/trim/nudge; render `is-locked`. Lock is UI-only (not persisted).
18. **`Shift+A`** MUST toggle linked highlight: selecting V1/V2 also highlights companion stem lanes (visual only; no stem group-move).

## Batch move + undo + cull

19. `moveClips` MUST apply multiple lane moves in one transaction; optional `ripple` applies later-clip shifts server-side or client expands moves then sends the full set.
20. Multi-move / ripple cascades MUST push **one** undo snapshot.
21. Clips outside `[viewStart − pad, viewEnd + pad]` MUST NOT render (cull). No react-window requirement.

## Non-goals

Continuous zoom; beat track; cross-lane group move; Split remapped off `S`; DB-persisted locks; react-window list.

## Wave 3 follow-ups

See `cut-editor-shortcuts.md`, V2/VO marquee, minimap window drag, and `videon.cut.lockedClipIds.<cutId>` in `knowledge/paths.md` (UI locks MAY use localStorage; server lock remains out of scope).

## Wave 4

Slip commit + multilayer undo/redo: `cut-timeline-edit-ux-wave4.md`.

## Wave 5

Ripple-aware Resize trim: `cut-timeline-edit-ux-wave5.md`.

## Acceptance

- Spec + unit tests: ripple, marquee, cull, snap filter, peak LOD, moveClips smoke.
- Keyboard smoke: A/T/U/R/Shift+N/;/'/\\ /Shift+L/Shift+A; L remains shuttle.
- typecheck + vitest; staging deploy.
