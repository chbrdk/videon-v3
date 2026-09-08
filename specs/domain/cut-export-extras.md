# Cut export extras (canvas presets + Premiere XML)

**Status:** Accepted — 2026-09-08  
**Implements:** `PATCH setCanvas` · `cut_exports.format` `mp4` \| `premiere_xml` · Cut-Editor presets  
**API:** `specs/api/cuts.md`  
**Companions:** `cut-multi-source-compose.md` · MCP `videon.export_run` · Catalog `videon.export.run`  
**Federation:** `2026-05-plexon-federation-v3`

## Purpose

Let operators set the Cut **export canvas** via aspect presets and export either a normalized **MP4** or a **Premiere XMEML v4** XML (no media ZIP).

## Keep / drop vs legacy

| Legacy | v3 |
|--------|-----|
| Premiere ZIP + media copies | **Drop** — XML-only + signed download |
| Premiere XMEML | **Keep** — `premiere_xml` job |
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

| `format` | Artifact | MIME |
|----------|----------|------|
| `mp4` (default) | H.264 MP4 | `video/mp4` |
| `premiere_xml` | XMEML v4 sequence | `application/xml` |

XML uses placeholder `file://media/{originalFilename}` paths (relink in Premiere). Times from `cut_scenes` in ms → frames via Cut fps.

## Surfaces

| Surface | Behavior |
|---------|----------|
| Cut editor | Preset select + apply; Export MP4 / Premiere XML |
| Product API | `setCanvas`; POST exports `{ format }` |
| MCP | `videon.export_run` optional `format` |
| Catalog / Flow | `videon.export.run` — Flow-first; optional format |

## Requirements (EARS)

- WHEN `setCanvas` receives a known preset, the system MUST update `cuts.width`/`height` and return the cut.
- WHEN `custom` lacks valid even dimensions, the system MUST reject `invalid_payload`.
- WHEN export `format=premiere_xml`, the job MUST upload XML containing `<xmeml` and sequence width/height matching the Cut canvas.
- WHEN `format` is omitted, the system MUST default to `mp4`.
- WHERE `format` is unknown, the system MUST reject.

## Acceptance

- [ ] Cut editor applies 9:16 → canvas 1080×1920
- [ ] MP4 export after preset uses new canvas
- [ ] Premiere XML download opens as XMEML with correct sequence size
- [ ] MCP export_run with `format=premiere_xml` enqueues job
