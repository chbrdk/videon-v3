# API — Media generative edit

**Status:** Accepted — 2026-09-15  
**Domain:** `specs/domain/media-generative-edit.md`  
**Auth:** Session user + Access Model B (`platformProjectId`)

All routes require `platformProjectId` query. Media must belong to the resolved workspace.

## `POST /api/media/ai-create`

Enqueue a create job (T2V / I2V). No parent media required.

**Body (JSON):**

```json
{
  "intent": "create",
  "prompt": "A Ford Escort driving through rain at night",
  "modelId": "seedance_2_5_t2v",
  "durationSeconds": 5,
  "aspectRatio": "16:9",
  "referenceImageUrls": [],
  "seed": null,
  "idempotencyKey": "optional"
}
```

**Response `202`:** `{ "job": { …, "deepLink": "/library?…" } }`

When `referenceImageUrls` is non-empty, the gateway uses the image-to-video endpoint for the selected create model (or Seedance I2V).

---

## `POST /api/media/:mediaAssetId/generate`

Enqueue an edit job (`intent` defaults to `edit`).

**Body (JSON):**

```json
{
  "intent": "edit",
  "startMs": 0,
  "endMs": 8000,
  "prompt": "Change the car to a Ford Escort",
  "modelId": "seedance_2_5_edit",
  "skipDraft": false,
  "keepSourceAudio": true,
  "referenceImageUrls": [],
  "seed": null,
  "idempotencyKey": "optional",
  "cutId": "optional-uuid"
}
```

**Response `202`:**

```json
{
  "job": {
    "id": "uuid",
    "mediaAssetId": "uuid",
    "status": "queued",
    "lane": "draft",
    "intent": "edit",
    "modelId": "seedance_2_5_edit",
    "progressPercent": null,
    "targetCutId": "optional-uuid",
    "deepLink": "/media/{id}?platformProjectId=…"
  }
}
```

Errors: `401`, `403`, `404`, `400` `invalid_payload`, `501` `not_implemented` (create), `503` queue/storage.

## `GET /api/media/:mediaAssetId/generate`

List jobs for the media (newest first). Bounded ≤ 50.

## `GET /api/cuts/:cutId/generate-jobs`

List generation jobs with `target_cut_id = cutId` (newest first). Bounded ≤ 50. Same auth as Cut detail.

## `GET /api/media/:mediaAssetId/generate/:jobId`

Single job (no signed URL). Includes `promotedMediaAssetId` when succeeded.

## `POST /api/media/:mediaAssetId/generate/:jobId/approve`

When `draft_ready`: set lane to `final`, re-queue. Body may include `{ "cutId": "…" }` remembered as `target_cut_id` for post-promote insert.

**Response `202`:** updated job.

## `POST /api/media/:mediaAssetId/generate/:jobId/promote`

Idempotent: if already promoted, returns existing asset. Otherwise requires `succeeded` with final storage (normally auto-promoted by worker — this endpoint exists for recovery / explicit cut insert).

**Body:**

```json
{
  "cutId": "optional-uuid"
}
```

When `cutId` is set (or job has `target_cut_id` and insert not yet done) and writable, appends a scene using the promoted asset full duration and sets `target_cut_inserted_at`.

## `GET /api/media/:mediaAssetId/generate/:jobId/download?kind=draft|final`

When the requested artifact exists: redirect to short-lived signed download.  
Otherwise `409` with current status.

## Service notes

- Queue: `videon.media.generate`
- Provider: OpenRouter Video API (`OPENROUTER_API_KEY`, `OPENROUTER_API_BASE_URL`) via `POST /api/v1/videos`
- Model slugs from catalog / env overrides — never hardcode in UI
- Video generation is not ZDR-eligible; do not send `zdr` on video requests
