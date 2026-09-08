# Media reframe (saliency crop → aspect derivative)

**Status:** Accepted — 2026-09-08  
**Implements:** `services/reframe-worker/` · `apps/web` API/jobs/UI · MCP `videon.reframe_run` · Catalog `videon.reframe.run`  
**API:** `specs/api/media-reframe.md`  
**Companions:** PLEXON `videon-integration.md` · `capability-catalog.md` · `assistant-videon-mcp.md` · `knowledge/paths.md`  
**Federation:** `2026-05-plexon-federation-v3`

## Purpose

Produce a Collection-scoped **derivative MP4** of an existing media asset, re-cropped to a target aspect ratio using **on-demand CPU saliency** (Robust OpenCV) and smooth crop motion, then FFmpeg H.264 re-encode.

## Keep / drop vs legacy (`chbrdk/videon`)

| Legacy | v3 |
|--------|-----|
| In-memory analyzer jobs + local FS | Durable `media.reframe` (pg-boss) + object store |
| SAM default (vit_b / SAM2) | **Default `robust_v1` (OpenCV)**; SAM = optional heavy lane later |
| Auto saliency after upload | **On-demand only** inside the reframe job |
| Separate SaliencyAnalysis table required before reframe | Single job may compute saliency then crop |
| Saliency heatmap canvas | **Drop** (MVP) |
| Flow / Hit-Card reframe | **No Flow node, no Hit-Card action** (Agent/Catalog confirm only) |

## Inputs

| Field | Rules |
|-------|-------|
| `mediaAssetId` | Existing non-archived media in workspace |
| `platformProjectId` | Access Model B writable |
| `aspectRatio` | `9:16` \| `16:9` \| `1:1` \| `custom` |
| `customWidth` / `customHeight` | Required when `custom`; positive integers; max 3840 on either side |
| `smoothingFactor` | 0–1, default `0.3` |
| `idempotencyKey` | Optional; server derives stable key from media + aspect + params when omitted |
| `saliencyModel` | Default `robust_v1`; other values rejected until SAM lane ships |

## Outputs

| Output | Notes |
|--------|-------|
| `media_reframes` row | Status `queued` → `running` → `succeeded` \| `failed` \| `cancelled` |
| Object key | `{workspaceId}/media/{mediaAssetId}/derivatives/reframe/{reframeId}.mp4` |
| Progress | Optional `progress_percent` 0–100 while running |
| MCP / Catalog | Job ref + deep link — **no** binary, **no** signed URL |

## Job lifecycle

1. API inserts row `queued`, enqueues `videon.media.reframe`.
2. Worker marks `running`, downloads source from object store.
3. Calls always-on **reframe-worker** HTTP (`VIDEON_REFRAME_SERVICE_URL`) with source bytes + aspect + smoothing.
4. Worker uploads derivative, sets `storage_key` / `bytes`, `succeeded`.
5. Failures set `failed` + bounded `error_message`; retries follow pg-boss policy.

Idempotent on unique `idempotency_key`. Duplicate POST returns the existing row.

## Saliency model policy

- **Default:** `robust_v1` — edges + color contrast + Haar faces + center bias (CPU OpenCV).
- **Later (not this wave):** SAM heavy lane on a dedicated Coolify worker / GPU when approved.
- Saliency is **not** part of analysis capability bundles.

## Surfaces

| Surface | Behavior |
|---------|----------|
| Media editor UI | Dialog (presets + smoothing) + derivative list / download |
| Product API | Create / list / get / signed download |
| MCP | `videon.reframe_run` — confirm/job |
| Catalog | `videon.reframe.run` — Agent (+ Flow surfaces reserved; **no** Flow node yet) |
| Hit-Card | **Forbidden** |
| Collection Flow node | **Out of scope** (Later) |

## Requirements (EARS)

- WHEN a writable member POSTs a valid reframe body, the system MUST accept a durable job and return `reframeId` + status.
- WHEN `aspectRatio=custom` AND width/height missing or invalid, the system MUST reject with `invalid_payload`.
- WHEN the reframe-worker is unavailable, the job MUST fail retryably without deleting the source asset.
- WHEN status is `succeeded`, download MUST use a short-lived workspace-scoped signed URL (or authenticated stream) — never embed in MCP.
- WHERE SAM is requested before the heavy lane exists, the system MUST reject `saliencyModel`.

## Acceptance

1. Specs + paths updated; migration applied on staging.
2. Staging smoke: enqueue 9:16 reframe → `succeeded` → downloadable derivative.
3. MCP/Catalog return job refs only; negative access tests pass.
4. No Flow node and no Hit-Card action shipped.
