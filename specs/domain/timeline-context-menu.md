# Timeline context menu (Phase 1)

**Status:** Accepted  
**Surface:** Media editor source timeline (`SourceMediaTimeline`)  
**Chrome:** `@msqdx/ui` `ContextMenu` (pointer-positioned)  
**Related:** `videon-ui-surfaces.md` · `msqdx-ui-context-menu.md`

## Purpose

Right-click on the source timeline opens an editor context menu so operators can open scene inspect, seek, and set In/Out without leaving the timeline. Future capabilities (export, comments) appear as disabled roadmap rows until backends exist.

## Targets

| Target | When |
|--------|------|
| `scene` | Right-click SI scene clip (track not muted/hidden) |
| `transcript` | Right-click TX segment (track not muted/hidden) |
| `lane` | Right-click empty lane / source filmstrip / ruler area (time from pointer) |

Browser default context menu MUST be suppressed (`preventDefault`).

## Phase 1 actions (enabled)

### Scene (`kind: scene`)

1. WHEN the operator chooses **Szenen-Infos** THEN the editor MUST seek to `startMs`, set `activeSceneKey`, open the Inspect drawer on tab `scenes`.
2. WHEN the operator chooses **Zur Szene springen** THEN the editor MUST seek to `startMs` (drawer MAY stay closed).
3. WHEN the operator chooses **In/Out auf Szene** THEN `markInMs`/`markOutMs` MUST become the scene `startMs`/`endMs`.
4. WHEN the operator chooses **Szene als Cut** THEN the editor MUST run the same create-cut path as the toolbar for that scene range (prompt for name).

### Lane (`kind: lane`)

5. WHEN the operator chooses **Hierher springen** THEN seek to pointer time `atMs`.
6. WHEN the operator chooses **In hier** / **Out hier** THEN set the matching mark to `atMs`.
7. WHEN marks exist AND the operator chooses **Markierungen löschen** THEN clear both marks.

### Transcript (`kind: transcript`)

8. WHEN the operator chooses **Hierher springen** THEN seek to segment `startMs`.
9. WHEN the operator chooses **Transkript öffnen** THEN open Inspect drawer on tab `transcript` and seek to `startMs`.

## Roadmap (disabled in Phase 1)

- **Szene exportieren** (`export-scene`)
- **Kommentar hinzufügen** (`add-comment`)

These MUST render disabled with no side effects.

## Non-goals (Phase 1)

- Nested submenus, Cut-editor timeline parity, mobile long-press, real export/comment backends.

## Acceptance

- Spec + unit builder tests for item ids / disabled flags.
- Manual: SI right-click → Szenen-Infos opens drawer with that scene.
