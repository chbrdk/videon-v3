# Adobe UXP — Cut ↔ Premiere manual parity

**Spec:** `specs/domain/adobe-uxp-cut-pushback-premiere.md`  
**Updated:** 2026-09-10  
**Panel:** ≥ **0.1.25**

## Product ask

Manual buttons; after sync, **Cut-Modell** gleich (V1 now). Not live sync.

## Buttons (Cuts tab)

| Button | Direction |
|--------|-----------|
| **In Premiere öffnen** | Cut → Premiere (first import; keep link) |
| **Premiere aktualisieren** | Fresh ZIP → import → **delete prior linked sequences** (no duplicates) |
| **Cut aktualisieren → Übernehmen** | Premiere → Cut only (**no** ZIP / no new sequence) |
| **Übernehmen + Sequenz ersetzen** | Apply Cut, then same as Premiere aktualisieren |

## Why “alte Version” / zig Sequenzen happened

1. After apply, Open Cut reused an export with `createdAt >= cut.updatedAt` while the Cuts-list still held the **pre-apply** `updatedAt` → old ZIP.
2. Each import created another sequence; nothing deleted the previous link.

## Capture

1. `ProjectConverter.exportAsFinalCutProXML` (Premiere ≥ 26.2)  
2. Else file picker for exported XML  

Mapping: `file-{mediaAssetId}` when preserved; after Premiere re-export resolve `<file>` registry + filename vs Cut/Collection media (`file-1` is not a media id).

## Operator

UDT Unload → Load → **v0.1.25** → Collection pin → Cuts → open → edit in Premiere → **Cut aktualisieren** → **Übernehmen** (stay on same sequence). Only use **Sequenz ersetzen** when the Cut editor is ahead.

## Restore constraints

- `cut_scenes.id` / `media_asset_id` are UUIDs (panel emits UUID v4; server replaces invalid ids).
- Min clip duration **500ms** (`MIN_CUT_CLIP_MS`); pushback clamps shorter Premiere clips before apply.
