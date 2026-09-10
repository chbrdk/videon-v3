# Adobe UXP — Cut ↔ Premiere manual parity

**Spec:** `specs/domain/adobe-uxp-cut-pushback-premiere.md`  
**Updated:** 2026-09-10  
**Panel:** ≥ **0.1.22**

## Product ask

Manual buttons; after sync, **Cut-Modell** gleich (V1 now). Not live sync.

## Buttons (Cuts tab)

| Button | Direction |
|--------|-----------|
| **In Premiere öffnen** / **Premiere aktualisieren** | Cut → Premiere (Open Cut) |
| **Cut aktualisieren** | Premiere → Cut (capture → diff → restore V1) |
| **Übernehmen + Premiere neu laden** | Apply + Open Cut refresh |

## Capture

1. `ProjectConverter.exportAsFinalCutProXML` (Premiere ≥ 26.2)  
2. Else file picker for exported XML  

Mapping: `file-{mediaAssetId}` when preserved; after Premiere re-export resolve `<file>` registry + filename vs Cut/Collection media (`file-1` is not a media id).

## Operator

UDT Unload → Load → **v0.1.22** → Collection pin → Cuts → open → edit in Premiere → **Cut aktualisieren** → Diff → übernehmen.

## Still open

Staging smoke; V2/VO apply; skip-unmapped policy.

## Restore constraints

- `cut_scenes.id` / `media_asset_id` are UUIDs (panel emits UUID v4; server replaces invalid ids).
- Min clip duration **500ms** (`MIN_CUT_CLIP_MS`); pushback clamps shorter Premiere clips before apply.
