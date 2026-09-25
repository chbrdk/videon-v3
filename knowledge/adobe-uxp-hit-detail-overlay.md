# Panel hit detail overlay

**Status:** Active — panel ≥ **0.1.49**  
**Spec:** `specs/domain/adobe-uxp-library-panel.md` § Panel UX  
**Related:** `knowledge/adobe-uxp-scenes-provider-polish.md`, `knowledge/adobe-uxp-panel-msqdx-ui.md`, `knowledge/adobe-uxp-panel-preview-playback.md`

## Decision (2026-09-11)

| Card action | Role |
|-------------|------|
| **Anzeigen** | Opens in-panel detail overlay (preview + metadata) |
| **+** | Insert into Premiere / AE (unchanged) |
| **In VIDEON** | Only on the detail sheet (deep link) — not a wide card button |

Rationale: Card chrome stays compact; inspecting a scene (looping preview + fields) is a dedicated surface. External Product open is secondary.

## Overlay contents

1. **Width-scaled preview** (`sizeHitDetailMedia` + `bindUxpVideoPreview`): height ≈ panel sheet width × 9/16, capped at ~50% of panel height (min 140px, max 360px). `object-fit: contain`. Same `/preview` cache as card hover — video stays laid out at `opacity: 0` until `playing` (do not use `display:none` while loading).
2. **Metadata rows** (from search hit + current query): Datei, Typ (Szene / voller Clip), Szene ordinal / sceneKey, In/Out, Dauer (clock + seconds), Zeit (ms), Collection, Rank, Analysis (`analysisRunId`), Asset, Project-ID, Hit-ID, Deep Link, Query.
3. Index text / search snippet (panel allows up to 800 chars; API may still truncate earlier).
4. Actions: **Einfügen**, **Auswählen**, **In VIDEON**, **Schließen**.

Structured fields such as mood/location only appear if the search index already flattened them into `searchText` — no extra API round-trip in 0.1.48.

## Interaction

- Card click or **Anzeigen** opens the overlay (no per-card checkbox).
- Multi-select: **Alle** / **Keine**, or **Auswählen** in the overlay.
- **+** / overlay **Einfügen** still insert.

## UXP notes

- Plain HTML overlay (`#hit-detail` inside `#app`), not `<dialog>`.
- Use `position: absolute` inside `#app` — `position: fixed` / `100vh` often fail in Premiere UXP.
- Clip to panel: `html/body/#app` height 100% + overflow hidden; sheet `max-height: 100%`; body scrolls. Never margin the overlay via `#app > * + *`.
- Spacing via **margins** (no flex `gap`).
- Compact `ds-btn--xs` for card + overlay chrome.
- Re-size preview after show (`setTimeout` 50ms) — first paint may report 0 width.
