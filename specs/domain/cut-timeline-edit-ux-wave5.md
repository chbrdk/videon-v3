# Cut timeline edit UX — Wave 5 (Ripple trim)

**Status:** Accepted — 2026-09-10  
**Surface:** `CutTimeline` / `CutEditorView`  
**Related:** `cut-timeline-edit-ux-wave2.md` · `cut-timeline-edit-ux-wave4.md` · `specs/api/cuts.md` (`trim`, `trimVideoClip`, `moveClips`)  
**Federation:** `2026-05-plexon-federation-v3`

## Purpose

Close the Wave 2 hole: **Ripple edit (`R`)** already shifts neighbors on move/nudge/delete, but **Resize edge-drag** left gaps or overlaps. Wave 5 applies the same end-delta ripple after a Resize trim on V1 and V2.

## Ripple trim

1. WHEN ripple edit is **on** AND `TrimMode` is **Resize** (`ripple`) AND the operator commits a V1 edge resize THEN the system MUST:
   - persist the trim (`trim` + optional `timelineStartMs`);
   - shift later **same-lane** V1 clips by `Δend = newEnd − oldEnd` where `end = timelineStart + duration`;
   - push **one** multilayer undo snapshot for trim + cascade.
2. WHEN the same conditions hold for a V2 overlay clip THEN apply the same rule via `trimVideoClip` + `moveClips` on the V2 lane.
3. WHEN `Δend = 0` (e.g. start-edge resize that anchors the right edge, or Slip) THEN the system MUST NOT emit neighbor moves.
4. WHEN ripple edit is **off** OR mode is Slip/Roll THEN Resize MUST keep free-arrange neighbor positions (Wave 1/4 behavior).
5. Neighbor selection: clips with `timelineStartMs + 1 >= oldEnd` (same rule as `rippleShiftLaterClips` / delete close-gap).

## Non-goals

VO live-pointermove ripple (audio trim still commits per move — cascade deferred); linked companion group-trim; transitions; audio levels.

## Acceptance

- [x] Spec locked
- [x] Resize+R shortens end → later same-lane clips move left by Δ
- [x] Resize+R lengthens end → later same-lane clips move right by Δ
- [x] Ripple off → neighbors stay put
- [x] One undo snapshot covers trim + cascade
- [x] vitest + typecheck; staging deploy
