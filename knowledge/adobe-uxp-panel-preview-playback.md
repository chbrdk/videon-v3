# Adobe UXP panel — MP4 card preview playback

**Status:** 2026-09-11 — panel ≥ **0.1.49**  
**Spec:** `specs/domain/adobe-uxp-library-panel.md` · `specs/api/media-preview.md`  
**Code:** `tools/adobe-uxp-library-panel/src/{api,cache,index}.js`

## Problem

Premiere UXP `<video>` often fails on `blob:` object URLs (images/`<img>` may still work with blobs). Cards/detail showed still posters but no looping MP4.

Additional UXP traps (0.1.49):

1. **`display: none` while loading** — decoder often never fires `loadeddata` / `canplay`. Keep the element laid out (`opacity: 0`) until `playing`, then add `.is-visible`.
2. **Wrong file URL scheme** — Adobe documents `file:/Users/…` / `file:/C:/…`. Browser-style `file:///…` alone is unreliable. Prefer `plugin-data:/name`, `getFsUrl`, then `file:/` (UXP), then `file:///` fallback.
3. **`play()` may resolve even on failure** — reveal on `playing` (or non-paused after timeout); on stall/`error`, advance to the next src candidate.

## Approach

1. `GET /api/media/:id/preview` → bytes via XHR (`fetchPreviewBlob`).
2. Write MP4 into UXP data folder (`materializePreview`).
3. Build playback candidates: `plugin-data:/` → `getFsUrl` → `file.url` → `file:/native` → `file:///native` → raw `nativePath` → last-resort `blob:`.
4. `bindUxpVideoPreview` (cards + detail) tries candidates until `playing`; logs `[VIDEON] … try src` / `all src candidates failed` / `play stalled`.

## Operator check

1. Rebuild: `cd tools/adobe-uxp-library-panel && npm run build`
2. UDT: **Unload → Load** the **repo** folder (not a stale External copy).
3. Header must show **v0.1.49**.
4. Search → UDT console should show `materializePreview ok` then `card:… try src` / `detail try src` without `preview HTTP` 401/503 — video should loop over the poster.
