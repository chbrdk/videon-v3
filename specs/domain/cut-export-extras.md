# Cut export extras (canvas presets + Premiere ZIP)

**Status:** Accepted — 2026-09-09 (ZIP media package)  
**Implements:** `PATCH setCanvas` · `cut_exports.format` `mp4` \| `premiere_xml` · Cut-Editor presets  
**API:** `specs/api/cuts.md`  
**Companions:** `cut-multi-source-compose.md` · MCP `videon.export_run` · Catalog `videon.export.run`  
**Federation:** `2026-05-plexon-federation-v3`

## Purpose

Let operators set the Cut **export canvas** via aspect presets and export either a normalized **MP4** or a **Premiere Pro package** (XMEML v4 + source media in a ZIP).

## Keep / drop vs legacy

| Legacy | v3 |
|--------|-----|
| Premiere ZIP + media copies | **Keep** — `premiere_xml` job uploads `.zip` |
| Premiere XMEML | **Keep** — inside ZIP as `{cutName}.xml` |
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
- Operator flow: extract ZIP → Import XML in Premiere → clips link offline-ready when relative `media/` resolves.

## Surfaces

| Surface | Behavior |
|---------|----------|
| Cut editor | Preset select + apply; Export MP4 / Premiere ZIP |
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

## Acceptance

- [ ] Cut editor applies 9:16 → canvas 1080×1920
- [ ] MP4 export after preset uses new canvas
- [ ] Premiere download is a ZIP; unzipped XML opens as XMEML with correct sequence size and `file://media/…` paths
- [ ] Unzipped `media/` contains each unique source; Premiere can link without manual file picker when extracted together
- [ ] MCP export_run with `format=premiere_xml` enqueues job
