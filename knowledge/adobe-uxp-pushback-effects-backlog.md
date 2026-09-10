# Pushback — Best-effort Premiere NLE sidecars

**Status:** Shipped panel ≥ **0.1.28** + migrations `0018` / `0019`  
**Updated:** 2026-09-10  
**Spec:** `specs/domain/adobe-uxp-cut-pushback-premiere.md` § Wave P3

## Product rule

Capture **as much as XMEML exposes** from Premiere and keep it in Cut **data** (no Videon UI). Re-emit on `premiere_xml` export so round-trips preserve look where Premiere’s XML can represent it.

## What we store

| Layer | Column | Contents |
|-------|--------|----------|
| Clip | `cut_scenes.premiere_filters_xml` | Residual clipitem XML (filters, labels, markers, comments, alphatype, …) — everything except timing/`file`/`sourcetrack` we rewrite |
| V1 track | `cuts.premiere_v1_track_sidecar_xml` | Track body after removing clipitems (transitions, generators, titles on that track) |
| Sequence | `cuts.premiere_sequence_extras_xml` | Sequence extras outside `<media>` (markers, …) |

## Honest limits

- Only what Premiere puts into the captured XMEML. Pure host-DOM state that never serializes cannot be stored.
- Nested sequences / some third-party plugins often flatten or drop in XML.
- Re-import fidelity depends on Premiere accepting the re-injected fragments.
- V2/VO lanes: clip mapping still P2.1; their extras follow when those lanes apply.

## Operator

Panel **v0.1.28** → Cut aktualisieren → Übernehmen → Premiere aktualisieren. Diff may show `Clip-Sidecar` / `Track-Sidecar` / `Sequenz-Extras`.
