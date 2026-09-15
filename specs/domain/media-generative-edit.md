# Media generative edit (AI clip edit / create)

**Status:** Accepted — 2026-09-15  
**Implements:** `apps/web` API/jobs/UI · OpenRouter Video API gateway · Catalog `videon.generate.edit` / `create`  
**API:** `specs/api/media-generative-edit.md`  
**Companions:** `knowledge/ai-clip-generation.md` · `knowledge/paths.md` · `media-reframe.md` (job pattern)  
**Federation:** `2026-05-plexon-federation-v3`

## Purpose

Produce Collection-scoped **AI-edited (or later AI-created) video** from operator prompts. Phase 1 is **edit** of an existing media range (video-to-video). Output promotes to a new `media_assets` row with lineage so Cuts, Mediathek, and Adobe share one path.

## Phase scope

| Intent | Phase 1 | Later |
|--------|---------|-------|
| `edit` | Ship | — |
| `create` (T2V / I2V) | Ship (Create-Welle) | — |
| MCP / Assistant | `videon.generate_edit_run` · `videon.generate_create_run` | — |

## Inputs (edit)

| Field | Rules |
|-------|-------|
| `mediaAssetId` | Existing non-archived media in workspace |
| `platformProjectId` | Access Model B writable |
| `startMs` / `endMs` | Inclusive-exclusive source range; duration 1…`MAX_EDIT_DURATION_MS` (12_000). Worker expands short ranges to the model input floor (Seedance ≥4s, MiniMax H3 Edit ≥5s) within the parent media before calling OpenRouter. |
| `prompt` | Non-empty; server wraps with preserve clauses (Quality Lock) |
| `modelId` | Catalog allowlist; default `seedance_2_5_edit` |
| `skipDraft` | Default `false` — draft lane then approve; `true` → final only |
| `keepSourceAudio` | Default `true` — mux source audio onto provider video |
| `referenceImageUrls` | Optional http(s) URLs (≤4) for subject references |
| `seed` | Optional int for reproducibility |
| `idempotencyKey` | Optional; else derived from media + range + prompt + model + flags |
| `cutId` | Optional on create/approve — stored as `target_cut_id`; worker appends promoted asset after final promote (once) |

## Outputs

| Output | Notes |
|--------|-------|
| `media_generation_jobs` row | See status machine |
| Draft / final keys | `{ws}/media/{parentId}/derivatives/generate/{jobId}/draft.mp4` · `final.mp4` · `slice.mp4` |
| Promoted asset | New `media_assets` + `media_asset_lineage` |
| Progress | `progress_percent` 0–100 |

## Status machine

`queued` → `running` → (`draft_ready` → approve → `queued`/`running`) → `succeeded` \| `failed` \| `cancelled`

- Draft path: first run ends in `draft_ready` (not a pg-boss failure).
- Approve sets `lane=final`, re-queues.
- `skipDraft=true`: single run to `succeeded` (final + promote).
- On final success the worker **auto-promotes** to a ready `media_assets` row.

## Quality Lock (normative)

1. Edit only the requested range (trim slice before provider; expand to model input floor when shorter).
2. Lock pack: start/mid/end times, prompt with preserve clauses, optional refs, seed, resolution tier.
3. Draft at 480p; final at 720p (catalog may override).
4. Default keep source audio.
5. Lineage records parent asset, range, model, prompt, lock_pack_hash, job id.
6. Brand check is **not** automatic; use existing brand seam after analysis. Never synthetic pass.
7. After promote, the worker MUST schedule a light media analysis run (best-effort; promote still succeeds if enqueue fails).
8. Seedance V2V through OpenRouter MUST send a concrete `duration` matching the prepared input clip (4–30s). Do not send `duration: -1` (OpenRouter schema rejects it) and do not omit duration. Quality Lock MUST NOT prefix prompts with `edit:` (triggers Seedance edit-mode that requires -1).

## Model catalog

Internal ids only (UI never hardcodes provider endpoints). Phase 1 edit models — gateway is **OpenRouter** `POST /api/v1/videos` (reuses `OPENROUTER_API_KEY`):

| `modelId` | Role | OpenRouter model slug (env-overridable) |
|-----------|------|----------------------------------------|
| `seedance_2_5_edit` | Default final (+ draft at 480p) | `bytedance/seedance-2.5` (video ref via `input_references`) |
| `minimax_hailuo_3_edit` | Instruction / brand-text / motion-transfer edit | `minimax/hailuo-3` |
| `happy_horse_draft` | Cheap draft lane | same Seedance slug @ 480p |
| `runway_aleph_2` | Keyframe-precise edit | Enabled only when `VIDEON_GENERATION_ALEPH_MODEL` is set |

Create-only ids MUST be rejected for `intent=edit`:

| `modelId` | OpenRouter slug |
|-----------|-----------------|
| `seedance_2_5_t2v` | `bytedance/seedance-2.5` |
| `wan_3_0_create` | `alibaba/wan-3.0` |
| `minimax_hailuo_3_create` | `minimax/hailuo-3-max` |
| `veo_3_1_lite_create` | `google/veo-3.1-lite` |
| `veo_3_1_create` | `google/veo-3.1` |

Client-safe recommend rules (no env): `apps/web/lib/generation/recommend.ts` — object replace → Seedance; MiniMax keywords → H3; keyframe/Aleph → Aleph when available; photoreal create → Veo; wan/story → Wan 3.0.

**Note:** OpenRouter video generation is **not ZDR-eligible**. Do not send `zdr: true` on video jobs; if account-wide ZDR enforcement blocks video routing, operators must allow video outside ZDR (vision analysis may still use ZDR).

## Surfaces

| Surface | Behavior |
|---------|----------|
| Media editor UI | AI Edit dialog + job list / A/B / approve / open promoted |
| Cut editor UI | AI Edit on active clip; jobs via `GET /api/cuts/:cutId/generate-jobs`; auto-insert when `target_cut_id` set |
| Product API | Create / list / get / approve / download / promote meta · cut generate-jobs |
| MCP / Catalog | `videon.generate.edit` / `videon.generate.create` — job ref + deep link only |
| Hit-Card | Forbidden |

## Requirements (EARS)

- WHEN a writable member POSTs a valid edit body, the system MUST enqueue `videon.media.generate` and return job id + status.
- WHEN range duration is outside 1…12_000 ms, the system MUST reject `invalid_payload`.
- WHEN `intent=create` with a valid prompt, the system MUST enqueue a create job and promote a new media asset on success.
- WHEN `modelId` is unknown or role-mismatched for the intent, the system MUST reject `invalid_payload`.
- WHEN OpenRouter is unconfigured (`OPENROUTER_API_KEY` missing), the job MUST fail with a clear error without deleting the source.
- WHEN draft completes, status MUST be `draft_ready` until approve (unless `skipDraft`).
- WHEN final succeeds, the system MUST promote a new ready media asset with lineage.
- WHEN final promote completes, the system MUST attempt to schedule media analysis for the promoted asset.
- WHEN `target_cut_id` is set and Cut insert has not run yet, the worker MUST attempt to append the promoted asset to that Cut (best-effort).
- WHERE MCP exposes the capability later, responses MUST NOT embed binaries or signed URLs.

## Acceptance

1. Specs + paths + knowledge updated.
2. Contract tests: storage keys, idempotency, catalog allowlist, job name wiring.
3. UI: Media editor can start edit, poll, approve draft, open promoted asset.
4. No MCP tool required in Phase 1.
