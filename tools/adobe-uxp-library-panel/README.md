# VIDEON Library — Adobe UXP Panel (Premiere Wave 1 + AE Wave 1.5)

**Spec:** [`specs/domain/adobe-uxp-library-panel.md`](../../specs/domain/adobe-uxp-library-panel.md)  
**API:** [`specs/api/media-adobe-download.md`](../../specs/api/media-adobe-download.md)

Dual-host panel for **Premiere Pro ≥ 25.6** and **After Effects** (manifest `AEFT`): search the Collection-scoped VIDEON library and insert scene ranges via local cache.

## Status

### Wave 1 — Premiere (hardened)

- Settings: Product base URL + Settings API token + default Collection + Bin name
- Search via `GET /api/media/search` + Bearer posters (`/frame` as blob)
- Download via `GET /api/media/:id/adobe-download?mode=json&kind=source` → **local** UXP cache
- Premiere adapter: Bin import + In/Out + optional Sequence insert

### Wave 1.5 — After Effects

- Dual-host `manifest.json` (`PPRO` + `AEFT`)
- Host detection → Comp / sequential / gap UI (not Premiere Bin/Sequence)
- Placement planner (`ae-placement.js`): sequential + gap frames, corrected layer source trim
- Insert path: ExtendScript `app.project` when the host exposes it; otherwise explicit `unsupported` / preview `plan` — **no fake success** (public AE UXP DOM still pending Adobe)
- Browser preview: `preview.html?host=AEFT` for AE chrome + plan-only insert

Not yet: public AE UXP DOM insert, proxy kind, device-code auth, `.ccx` packaging pipeline.

## Host-free development

See [`DEV.md`](./DEV.md) — browser preview (`preview.html`), curl smokes, unit tests.

## Load in UXP Developer Tool

1. Open UXP Developer Tool → Add Plugin → select this folder (`tools/adobe-uxp-library-panel`).
2. Launch / load against Premiere Pro and/or After Effects (dual-host).
3. Panel: **Window → VIDEON Library**.
4. Paste Product base URL + API token → Speichern → Collection wählen → Suchen.

## Manual QA

### Premiere (Wave 1)

1. Invalid token → search shows clear auth error.
2. Insert → local cache → Bin `VIDEON` contains clip; scene In/Out set.
3. Optional Sequence checkbox → clip at playhead on V1/A1.

### After Effects (Wave 1.5)

1. Host badge shows After Effects; Comp name + sequential/gap visible.
2. With ExtendScript `app.project`: layer placed in Comp with trimmed source window.
3. Without AE scripting APIs: clear error + placement plan in response (no silent success).
4. Browser `?host=AEFT`: plan-only insert message after download/cache.

## Layout

```
tools/adobe-uxp-library-panel/
├── manifest.json          # hosts PPRO 25.6 + AEFT
├── preview.html
├── package.json
├── README.md
└── src/
    ├── index.html / index.js / styles.css
    ├── api.js / hit-model.js / time.js / cache*.js
    ├── host.js            # PPRO vs AEFT detection
    ├── ae-placement.js    # pure AE timing planner
    ├── aftereffects.js    # AE host adapter
    ├── premiere.js / premiere-path.js
    └── shims/             # browser uxp / premierepro / aeft
```
