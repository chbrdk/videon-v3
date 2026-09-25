# Panel strategy — Provider-first (clips & scenes)

**Status:** Active decision — 2026-09-10  
**Panel:** ≥ **0.1.36**  
**Gates:** `tools/adobe-uxp-library-panel/src/panel-features.js`

## Decision

1. **In-place Cut ↔ Premiere timeline sync** (P4/P5) stays **paused** — unreliable moves/deletes.
2. **Cuts tab** (Open Cut / pushback / Cut neu laden) is **paused** in the operator UI.
3. Day-to-day surface = **Szenen / Clips**: search, preview, insert into Bin/Sequence (Wave 1).

We concentrate on being the **best clip & scene provider** into Premiere (and AE Wave 1.5).

**Polish ≥ 0.1.37:** see `knowledge/adobe-uxp-scenes-provider-polish.md` (In/Out + Sequence insert, hit cards, ordinals).

## Operator surface (≥ 0.1.36)

| Keep | Role |
|------|------|
| Collection pin | Model B scope |
| **Szenen suchen** | Scene-hit search (`scene-hit-model`) |
| Poster + ≤3s preview | Recognize before insert |
| Multi-select + Einfügen | `adobe-download` → cache → Bin / optional Sequence |
| Cache clear / stats | Local media hygiene |

| Hidden / gated off | Why |
|--------------------|-----|
| Cuts tab | Defer Cut package handoff; avoid sync rabbit hole |
| Premiere aktualisieren (in-place) | Unreliable |
| Cut-change poll + Auto-Patch | Depends on in-place |

Code for Cuts/Open Cut/pushback/P4 remains in-repo behind `ENABLE_CUTS_TAB` / `ENABLE_INPLACE_PATCH` — not deleted.

## Product focus next

1. Scene/clip **representation**: clear filename, timing, sceneKey, snippet, project.
2. Reliable **insert** (In/Out, Sequence append when host allows).
3. Search/empty/loading UX polish.
4. Later (optional): re-enable Cuts tab as **explicit package delivery** only — never silent live sync.

## Specs

- `specs/domain/adobe-uxp-library-panel.md` — Cuts tab paused; scenes primary  
- `specs/domain/adobe-uxp-cut-pushback-premiere.md` — P4/P5 paused  
- `specs/domain/adobe-uxp-open-cut-premiere.md` — UI paused; modules retained  
