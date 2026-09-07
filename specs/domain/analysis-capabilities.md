# Analysis capabilities (user bundles)

**Status:** Active  
**Product:** VIDEON v3  
**Companion:** `videon-ui-surfaces.md`, `stem-service.md`, PLEXON `videon-integration.md` (selected stages)

## Purpose

Operators choose **what** a media analysis run should produce before it starts. Selection is expressed as **user bundles**; the runner maps them to pipeline stages and may mark unselected stages `skipped`.

## User bundles

| Bundle id | Label (DE) | Capability IDs persisted on `analysis_runs.requested_capabilities` |
|-----------|------------|---------------------------------------------------------------------|
| `vision` | Szenen & Vision | `scene_detect`, `vision` |
| `transcript` | Transkript | `transcript` |
| `stems` | Stems (Demucs) | `stems.demucs` |
| `aggregate` | Zusammenfassung | `aggregate` |

Always persisted (not a user toggle): `probe`. Always executed: `ingest`, `probe`.

Auto-with stages (not separate checkboxes):

- Vision ⇒ `frame_sample`
- Transcript and/or Stems ⇒ audio extract inside `audio`
- Aggregate + vision results ⇒ `index` when insights exist

## Guarantees

1. WHEN the operator starts analysis from the media editor THEN the UI MUST open a confirmation dialog listing the four user bundles with **all checked by default**.
2. WHEN the operator confirms THEN the client MUST POST `capabilities` (whitelist of capability IDs and/or bundle ids) to `POST /api/media/:id/analysis`.
3. WHEN normalizing capabilities THEN the server MUST always include `probe`, MUST expand `vision` ⇒ `scene_detect` + `vision`, MUST NOT silently re-add deselected bundles, and MUST reject an empty user selection (only `probe`).
4. WHEN a stage is not required by the normalized set THEN the runner MUST record that stage as `skipped` (not `failed`) and MUST NOT call expensive providers for it.
5. WHEN `stems.demucs` is absent THEN the runner MUST NOT run Demucs and MUST NOT write ffmpeg “Voice” fakes for that run’s stem upsert.
6. WHEN `transcript` is absent THEN the runner MUST skip transcription (transcript row MAY be `skipped`).
7. WHEN `brand_compliance` would run inside the media-analysis job THEN it MUST be `skipped` — Brand-Check remains a separate editor action.
8. WHEN analysis is auto-scheduled after upload complete THEN capabilities MUST be the upload default set: `probe`, `scene_detect`, `vision`, `transcript`, `aggregate` (**without** `stems.demucs`).

## API

`POST /api/media/:mediaAssetId/analysis?platformProjectId=…`

```json
{ "capabilities": ["scene_detect", "vision", "transcript", "stems.demucs", "aggregate"] }
```

Legacy body `{ "stemMethod": "demucs" }` MUST normalize to the upload default set plus `stems.demucs`.

## Acceptance

- Deselecting Vision skips `scene_detect`, `frame_sample`, and `vision`.
- Deselecting Stems skips Demucs; selecting only Transkript still runs Whisper/OpenRouter.
- Dialog submit is disabled when no user bundle is checked.
- Pipeline UI shows skipped stages distinctly from failed.
