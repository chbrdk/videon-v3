# Timeline context menu

**Status:** Accepted — Phase 2 Cut timeline  
**Surfaces:** Media editor source timeline · Cut editor sequence timeline  
**Chrome:** `@msqdx/ui` `ContextMenu` (pointer-positioned)  
**Related:** `videon-ui-surfaces.md` · `cut-multi-source-compose.md` · `msqdx-ui-context-menu.md`

## Purpose

Right-click opens an editor context menu so operators can inspect, seek, mark, and edit without leaving the timeline.

## Phase 1 — Media source timeline (`SourceMediaTimeline`)

### Targets

| Target | When |
|--------|------|
| `scene` | Right-click SI scene clip **or** SI track at a time inside a scene |
| `transcript` | Right-click TX segment |
| `lane` | Right-click empty lane / filmstrip / ruler |

Browser default context menu MUST be suppressed.

### Actions (enabled)

Scene: Szenen-Infos · Zur Szene springen · In/Out auf Szene · Szene als Cut.  
Lane: Hierher springen · In/Out hier · Markierungen löschen.  
Transcript: Hierher springen · Transkript öffnen.

### Roadmap (disabled)

- Szene exportieren · Kommentar hinzufügen

## Phase 2 — Cut sequence timeline (`CutTimeline`)

### Targets

| Target | When |
|--------|------|
| `cut-clip` | Right-click V1 clip |
| `cut-lane` | Right-click empty V1 lane / ruler (time from pointer) |

### Actions (enabled)

#### Clip (`kind: cut-clip`)

1. WHEN **Clip prüfen** THEN select the clip and focus the right Clip-Properties rail.
2. WHEN **Zur Clip-Start** THEN seek Cut playhead to clip timeline start.
3. WHEN **An Playhead teilen** AND playhead lies inside the clip THEN run `split` at that source time.
4. WHEN **Mit nächstem verbinden** AND next clip shares `media_asset_id` THEN run `merge`.
5. WHEN **Löschen** THEN run `delete` (disabled when only one clip remains).

#### Lane (`kind: cut-lane`)

6. WHEN **Hierher springen** THEN seek to pointer Cut time.
7. WHEN trim mode labels are shown THEN they are informational only (mode stays toolbar-owned).

### Non-goals (Phase 2)

- Nested submenus, mobile long-press, transitions, editing stem lanes as bus tracks.

## Acceptance

- Spec + unit builder tests for Media and Cut item ids / disabled flags.
- Manual: Cut clip right-click → Clip prüfen opens properties rail.
