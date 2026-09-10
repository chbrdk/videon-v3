# Cut timeline edit UX — Wave 4 (Slip + multilayer undo)

**Status:** Accepted — 2026-09-10  
**Surface:** `CutTimeline` / `CutEditorView`  
**Related:** `cut-timeline-edit-ux-wave2.md` · `cut-editor-shortcuts.md` · `specs/api/cuts.md` (`trim`, `rollTrim`, `restore`)  
**Federation:** `2026-05-plexon-federation-v3`

## Purpose

Close advertised NLE fidelity after Waves 1–3: **Slip** must commit (not silently fall back to Resize), and **Undo/Redo** must restore V1 + V2 + VO in one snapshot.

## Slip / Resize / Roll

1. WHEN `TrimMode` is `trim` (UI label **SLIP**) AND the operator edge-drags a V1 clip THEN the system MUST shift `start_ms`/`end_ms` by the same Δ while keeping clip duration and `timeline_start_ms` unchanged; persist via `trim` (optional `timelineStartMs` omitted or equal to current).
2. WHEN `TrimMode` is `ripple` (UI **RESIZE**) THEN edge-drag MUST change duration (existing Wave 1/2 free-arrange resize).
3. WHEN `TrimMode` is `roll` (UI **ROLL**) THEN edge-drag on a shared same-media V1 boundary MUST call `rollTrim`.
4. WHEN `TrimMode` is `trim` AND the operator edge-drags a V2 overlay clip THEN the same slip rules MUST apply via `trimVideoClip` (timeline start unchanged).
5. WHEN `TrimMode` is `trim` AND the operator edge-drags a VO bus clip THEN slip MUST apply via `trimAudioClip` (timeline start unchanged). WHERE mode is Resize, VO edge-drag keeps duration-changing behavior.
6. The editor MUST NOT coerce Slip (`trim`) to Resize (`ripple`) on edge drag.

## Multilayer undo / redo

7. WHEN the editor pushes an undo snapshot THEN the snapshot MUST include V1 `scenes`, V2 `videoClips`, and VO `audioClips` (plus playhead / active index).
8. WHEN the operator undoes or redoes THEN `PATCH restore` MUST replace all three clip lists in one transaction and return `{ scenes, videoClips, audioClips }`.
9. `restore` scenes MUST honor `timelineStartMs` on each V1 scene (free-arrange undo).
10. Multi-move / ripple cascades remain one undo snapshot (Wave 2); the snapshot shape is the multilayer one above.

## Non-goals

Transitions; per-clip audio levels; DB-persisted locks; Adobe panel; Premiere smoke; Slip body-drag tool (edge only this wave).

## Acceptance

- [x] Spec locked
- [x] Slip edge-drag keeps timeline duration; only source in/out moves; monitor seek follows
- [x] Roll still adjusts shared same-media V1 boundary via `rollTrim`
- [x] Undo/redo restores V1 + V2 + VO in one snapshot
- [x] vitest + typecheck; staging deploy
