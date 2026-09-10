# Adobe UXP — Cut ↔ Premiere manual parity

**Spec:** `specs/domain/adobe-uxp-cut-pushback-premiere.md`  
**Updated:** 2026-09-10  
**Panel:** ≥ **0.1.27**

## Product ask

Manual buttons; after sync, **Cut-Modell** gleich (V1). Not live sync.  
**Clip effects** persist as opaque XMEML filters in Cut data (no Videon UI) — see `knowledge/adobe-uxp-pushback-effects-backlog.md`.

## Buttons (Cuts tab)

| Button | Direction |
|--------|-----------|
| **In Premiere öffnen** | Cut → Premiere (first import; keep link) |
| **Premiere aktualisieren** | Fresh ZIP → import → **delete prior linked sequences** (no duplicates) |
| **Cut aktualisieren → Übernehmen** | Premiere → Cut only (**no** ZIP / no new sequence) |
| **Übernehmen + Sequenz ersetzen** | Apply Cut, then same as Premiere aktualisieren |

## Effects

Stored on `cut_scenes.premiere_filters_xml`, re-injected on export. Transitions not yet. No loss banner for clip filters.

## Capture

1. `ProjectConverter.exportAsFinalCutProXML` (Premiere ≥ 26.2)  
2. Else file picker for exported XML  

Mapping prefers Cut media over Mediathek duplicates (`mergePushbackMediaCatalog`).

## Operator

UDT Unload → Load → **v0.1.27** → Collection pin → Cuts → edit in Premiere (incl. clip FX) → **Cut aktualisieren** → **Übernehmen** → **Premiere aktualisieren** / Sequenz ersetzen to verify FX return.
