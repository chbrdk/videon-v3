# Cut export extras (canvas presets + Premiere ZIP)

**Status:** Accepted — 2026-09-09 (ZIP media package)  
**Implements:** `PATCH setCanvas` · `cut_exports.format` `mp4` \| `premiere_xml` · Cut-Editor presets  
**API:** `specs/api/cuts.md`  
**Companions:** `cut-multi-source-compose.md` · MCP `videon.export_run` · Catalog `videon.export.run` · Panel open-cut wave `adobe-uxp-open-cut-premiere.md`  
**Federation:** `2026-05-plexon-federation-v3`

## Purpose

Let operators set the Cut **export canvas** via aspect presets and export either a normalized **MP4** or a **Premiere Pro package** (XMEML + source media in a ZIP).

## Keep / drop vs legacy

| Legacy | v3 |
|--------|-----|
| Premiere ZIP + media copies | **Keep** — `premiere_xml` job uploads `.zip` |
| Premiere XMEML | **Keep** — inside ZIP as `{cutName}.xml` (`xmeml version="5"`, exploded tracks) |
| FCPXML route (actually XMEML) | **Drop** |
| Hardcoded 1920×1080 / 30fps | Use Cut `width`/`height`/`frame_rate` |
| SRT / reframing keyframes in XML | **Drop** this wave |

## Canvas presets (locked)

| Preset | width × height |
|--------|----------------|
| `9:16` | 1080 × 1920 |
| `16:9` | 1920 × 1080 |
| `1:1` | 1080 × 1080 |
| `custom` | body `width`/`height` (even, 2–3840) |

`frame_rate` unchanged unless null → default **25**. MP4 export already re-encodes to Cut canvas when needed.

## Export formats

| `format` | Artifact | MIME | Download ext |
|----------|----------|------|--------------|
| `mp4` (default) | H.264 MP4 | `video/mp4` | `.mp4` |
| `premiere_xml` | ZIP: XMEML + `media/` sources | `application/zip` | `.zip` |

API id stays `premiere_xml` (sequence is XMEML). The stored/downloadable object is a **ZIP**, not bare XML.

### Premiere ZIP layout

```
{sanitizedCutName}.xml
media/{uniqueOriginalBasename}
README.txt
```

- `<pathurl>` values MUST be `file://media/{basename}` matching ZIP entries under `media/`.
- Each distinct `media_asset_id` appears once under `media/` (full source file, not trimmed segments).
- Duplicate original filenames MUST be disambiguated (`clip.mp4`, `clip-2.mp4`, …).
- XMEML MUST emit exploded stereo tracks (`currentExplodedTrackIndex` / `premiereTrackType`) with matching `<in>`/`<out>` on video and audio; do **not** emit incorrect `pproTicks*` (they cause Premiere to ignore audio source offsets).
- Operator flow: extract ZIP → Import XML in Premiere → clips link offline-ready when relative `media/` resolves.
- WHEN unmuted `audio_bus` clips exist THEN the ZIP MUST include those source files under `media/` and the XMEML MUST place them on additional audio tracks with timeline `start`/`end` and source `<in>`/`<out>` matching `cut_audio_clips` (`cut-multi-track.md`).
- WHEN exporting `mp4` AND unmuted bus clips exist THEN the job MUST mix bus audio into the program mix.
- WHEN exporting `mp4` AND unmuted VO bus clips extend past V1/V2 picture THEN the program duration MUST pad with black (or equivalent silence video) so the mix keeps the full VO (same end rule as Premiere sequence duration).

### Multilayer XMEML (locked — Wave Multilayer polish)

1. WHEN unmuted V2 overlay clips exist THEN XMEML MUST emit a **second video track** (after V1) with those clips at `timeline_start_ms` / source in–out (`cut-multi-track.md`).
2. Track `<name>` labels MUST be: video `V1`, `V2` (when present); audio V1 stereo pair `V1`; VO bus stereo pair `VO` (when present).
3. Sequence `<duration>` MUST be the max end among V1 scenes, V2 overlays, **and** VO bus clips (not video-only).
4. WHEN a V1 scene’s timeline span is **fully covered** by one or more unmuted V2 overlays THEN the linked V1 stereo audio clipitems for that scene MUST set `<enabled>FALSE</enabled>` (video V1 stays enabled so editors can restore). Partial V2 cover MAY leave V1 audio enabled (no mid-clip split this wave).
5. V2 remains video-only in XMEML (no linked V2 stems); Cut monitor stems stay a monitor concern.

## Surfaces

| Surface | Behavior |
|---------|----------|
| Cut editor | Preset select + apply; Export MP4 / Premiere ZIP |
| Adobe UXP panel | Open Cut wave — same ZIP, NLE-side open (`adobe-uxp-open-cut-premiere.md`) |
| Adobe UXP pushback (draft) | Manual Premiere → Cut — `adobe-uxp-cut-pushback-premiere.md` (not live sync) |
| Product API | `setCanvas`; POST exports `{ format }` |
| MCP | `videon.export_run` optional `format` |
| Catalog / Flow | `videon.export.run` — Flow-first; optional format |

## Requirements (EARS)

- WHEN `setCanvas` receives a known preset, the system MUST update `cuts.width`/`height` and return the cut.
- WHEN `custom` lacks valid even dimensions, the system MUST reject `invalid_payload`.
- WHEN export `format=premiere_xml`, the job MUST upload a ZIP containing `<xmeml` XML and every referenced source under `media/`, with sequence width/height matching the Cut canvas.
- WHEN `format` is omitted, the system MUST default to `mp4`.
- WHERE `format` is unknown, the system MUST reject.
- WHEN the Premiere download URL is issued, the filename extension MUST be `.zip` and Content-Disposition attachment.
- WHEN unmuted V2 overlays exist THEN Premiere XMEML MUST include a second named video track `V2` and mute fully covered V1 linked audio (see Multilayer XMEML).
- WHEN VO bus clips extend past video THEN sequence duration MUST still cover the bus end.
- WHEN exporting `mp4` with VO past picture THEN program length MUST cover the bus end (black pad + mix).

## Acceptance

- [ ] Cut editor applies 9:16 → canvas 1080×1920
- [ ] MP4 export after preset uses new canvas
- [ ] Premiere download is a ZIP; unzipped XML opens as XMEML with correct sequence size and `file://media/…` paths
- [ ] Unzipped `media/` contains each unique source; Premiere can link without manual file picker when extracted together
- [ ] MCP export_run with `format=premiere_xml` enqueues job
- [x] Unit: V2 second video track + named tracks + duration includes bus + V1 audio disabled under full V2 cover
- [ ] Staging smoke: multilayer ZIP imports in Premiere (V2 over V1, VO audible, no rogue V1 audio under full V2)
- [x] Unit: MP4 program slices pad black through VO end when bus extends past picture
