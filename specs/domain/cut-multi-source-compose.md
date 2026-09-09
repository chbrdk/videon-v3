# Cut multi-source scene compose

**Status:** Accepted — 2026-09-08  
**Implements:** Cut Bin scene insert · Batch addScenes · MCP `videon.cut_scenes_add` · Catalog `videon.cut.scenes.add` · Export normalize  
**API:** `specs/api/cuts.md`  
**Companions:** PLEXON `videon-integration.md` · `capability-catalog.md` · `assistant-videon-mcp.md` · `knowledge/paths.md`  
**Federation:** `2026-05-plexon-federation-v3`

## Purpose

Assemble and edit a **Cut** from analysis scenes (and whole clips) drawn from **multiple** media assets in the same Collection workspace. Export must succeed when sources differ in codec/size/fps.

## Keep / drop vs legacy (`chbrdk/videon`)

| Legacy | v3 |
|--------|-----|
| Multi-`videoId` project_scenes | Keep — `cut_scenes.media_asset_id` per clip |
| AI Creator (NL → multi-video rough cut) | **Drop** this wave |
| Audio level / trim extras beyond start/end | **Drop** (times only + optional `scene_key`) |
| Premiere export | **Keep ZIP** — `premiere_xml` on `cut_exports` uploads XMEML + `media/` sources (no FCPXML). Spec: `cut-export-extras.md` |
| Scene key on timeline clip | **Keep as optional** `scene_key` (provenance; times are export truth) |

## Model

| Field | Rules |
|-------|-------|
| `cut_scenes.media_asset_id` | Required; any ready media in the Cut’s workspace |
| `start_ms` / `end_ms` | Required; `end > start`; min clip 500 ms |
| `scene_key` | Optional; copied from analysis / search at insert; not re-bound on re-analysis |
| Cut canvas | `width` / `height` / `frame_rate` from primary media at create (export target) |

## Surfaces

| Surface | Behavior |
|---------|----------|
| Cut editor Bin (left rail) | List library media → load analysis scenes → multi-select insert; whole-video fallback |
| Cut Clip properties (right rail) | Selected clip In/Out / Dauer / Media via `PropertyInspector` — `videon-ui-surfaces.md` |
| Cut timeline | DnD reorder, edge trim (TRIM/RIPPLE/ROLL), ContextMenu Phase 2 — `timeline-context-menu.md` |
| Chat Hit-Strip / Media search | „Zum Cut“ / „Alle zum Cut“ via active Cut (`videon.v3.activeCut`) |
| Product API | `POST /api/cuts` multi-`scenes[]`; `PATCH` `addScenes` batch |
| MCP | `videon.cut_create` (multi-media scenes); `videon.cut_scenes_add` append |
| Catalog | `videon.cut.create` (existing Flow+Agent); `videon.cut.scenes.add` Agent-only (`flow: false`) |
| Flow node for scenes.add | **Out of scope** |
| Hit-Card capability confirm for batch add | **Out of scope** (local active-Cut path only) |
| Extra audio bus track | **Welle 2** — `cut-multi-track.md` (not this compose wave) |

## Chrome parity

- Cut compose MUST use dual docked rails (Bin + Clip properties) matching CREATION immersive patterns adapted for NLE — see `videon-ui-surfaces.md` Wave B.
- Clip edit ops remain the existing `PATCH` actions (`trim`, `rollTrim`, `split`, `merge`, `delete`, `reorder`, `addScenes`); Welle 1 does not change the flat `cut_scenes` model.

## Export normalize

- Homogeneous sources matching Cut canvas: stream-copy segment + concat OK.
- Heterogeneous (multiple `media_asset_id` **or** width/height/fps ≠ Cut): re-encode segments to Cut target (`libx264` + `aac`, scale/pad, fps).
- On copy-concat failure: one retry with full re-encode path.

## Requirements (EARS)

- WHEN `POST /api/cuts` includes `scenes[]`, each entry MUST include `mediaAssetId` and a resolvable time range (explicit or via `sceneKey` + latest analysis).
- WHEN `PATCH` action is `addScenes`, the system MUST insert all valid clips in one transaction and return the ordered timeline.
- WHEN the active Cut Collection matches the hit’s Collection, Chat/Search MUST be able to append one or many scene ranges.
- WHEN export sources are heterogeneous, the export job MUST re-encode to the Cut canvas rather than fail silently on stream-copy mismatch.
- WHERE `scene_key` is set on a clip, the system MUST treat `start_ms`/`end_ms` as authoritative for playback and export.

## Acceptance

- [ ] Two analyzed videos → Cut Bin inserts scenes from both → timeline plays across sources
- [ ] Chat „Alle zum Cut“ with active Cut appends all ranged hits
- [ ] MCP create with two `mediaAssetId`s succeeds; `cut_scenes_add` appends
- [ ] Multi-source export produces playable MP4 on staging
