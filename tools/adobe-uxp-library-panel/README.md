# VIDEON Library — Adobe UXP Panel (Premiere Wave 1)

**Spec:** [`specs/domain/adobe-uxp-library-panel.md`](../../specs/domain/adobe-uxp-library-panel.md)  
**API:** [`specs/api/media-adobe-download.md`](../../specs/api/media-adobe-download.md)

Panel for **Premiere Pro ≥ 25.6** (UXP `premierepro` module): search the Collection-scoped VIDEON library and insert scene ranges into a Bin, optionally onto the active Sequence.

## Status

Wave 1 host path (hardened):

- Settings: Product base URL + Settings API token + default Collection + Bin name
- Search via `GET /api/media/search` + Bearer posters (`/frame` as blob)
- Download via `GET /api/media/:id/adobe-download?mode=json&kind=source` → **local** UXP cache (HTTPS URLs are rejected for import)
- Cache hardening: existence check, oldest-first eviction (5 GiB / 80 entries), clear + stats in Settings, poster disk cache
- Premiere adapter (`src/premiere.js`):
  1. `ensureBin` (`createBinAction` + find by name)
  2. `importFiles([path], true, bin, false)` — `null` not `undefined` for root
  3. Resolve clip by `getMediaFilePath` / name walk
  4. `createSetInOutPointsAction` for scene `startMs`/`endMs`
  5. Optional `SequenceEditor.createInsertProjectItemAction` at playhead (V1/A1)

Not yet: full AE host adapter (stub in `src/aftereffects.js`), proxy kind, device-code auth, `.ccx` packaging pipeline.

## Host-free development

While waiting for UXP Developer Tool / Premiere: see [`DEV.md`](./DEV.md) — browser preview (`preview.html`), curl smokes, unit tests.


## Load in UXP Developer Tool

1. Open UXP Developer Tool → Add Plugin → select this folder (`tools/adobe-uxp-library-panel`).
2. Launch / load against Premiere Pro.
3. Panel: **Window → VIDEON Library** (label from manifest).
4. Paste Product base URL + API token → Speichern → Collection wählen → Suchen.

## Manual QA (Wave 1)

1. Invalid token → search shows clear auth error.
2. Search returns hits with timing + project name; posters load with Bearer.
3. Insert → local cache file under plugin data folder → Bin `VIDEON` (or configured name) contains clip.
4. Scene hit with `startMs`/`endMs` → clip In/Out set before optional Sequence insert.
5. Checkbox „Auch auf aktive Sequence“ → clip at playhead on V1/A1 (Bin-only still OK if Sequence fails).
6. Re-insert same asset reuses `cacheKey` file when present on disk; Settings → Cache aktualisieren / leeren.
7. “In VIDEON öffnen” opens Product deep link via `uxp.shell.openExternal`.

## Layout

```
tools/adobe-uxp-library-panel/
├── manifest.json          # host PPRO minVersion 25.6
├── package.json
├── README.md
└── src/
    ├── index.html
    ├── index.js
    ├── styles.css
    ├── api.js
    ├── hit-model.js
    ├── time.js
    ├── cache.js
    ├── cache-index.js     # pure eviction/stats helpers
    ├── premiere-path.js   # pure path helpers
    └── premiere.js        # host adapter
```
