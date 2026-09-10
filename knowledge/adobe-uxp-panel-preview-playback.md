# Adobe UXP panel — MP4 card preview playback

**Status:** 2026-09-10  
**Spec:** `specs/domain/adobe-uxp-library-panel.md` · `specs/api/media-preview.md`  
**Code:** `tools/adobe-uxp-library-panel/src/{api,cache,index}.js`

## Problem

Premiere UXP `<video>` often fails on `blob:` object URLs (images/`<img>` may still work with blobs). Cards showed still posters but no looping MP4.

## Approach (panel ≥ 0.1.16)

1. `GET /api/media/:id/preview` → bytes via XHR (`fetchPreviewBlob`).
2. Write MP4 into UXP data folder (`materializePreview`).
3. Build playback candidates: `file.url` → `localFileSystem.getFsUrl` → `plugin-data:/name` → `file://nativePath` → raw `nativePath` → last-resort `blob:`.
4. `applyPreviewToCard` tries candidates until `loadeddata`/`canplay`; logs `[VIDEON] video try src` / `all src candidates failed`.

## Operator check

1. Rebuild: `cd tools/adobe-uxp-library-panel && npm run build`
2. UDT: **Unload → Load** the **repo** folder (not a stale External copy).
3. Header must show **v0.1.16**.
4. Search → UDT console should show `materializePreview ok` then `video try src` without `preview HTTP` 401/503.
