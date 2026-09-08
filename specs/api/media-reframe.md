# API — Media reframe

**Status:** Accepted — 2026-09-08  
**Domain:** `specs/domain/media-reframe.md`  
**Auth:** Session user or service (`PLEXON_SERVICE_SECRET` + `X-Plexon-User-Id`) + Access Model B

All routes require `platformProjectId` query (or body where noted). Media must belong to the resolved workspace and not be archived for create.

## `POST /api/media/:mediaAssetId/reframe`

Enqueue a reframe job.

**Body (JSON):**

```json
{
  "aspectRatio": "9:16",
  "smoothingFactor": 0.3,
  "customWidth": null,
  "customHeight": null,
  "idempotencyKey": "optional",
  "saliencyModel": "robust_v1"
}
```

**Response `202`:**

```json
{
  "reframe": {
    "id": "uuid",
    "mediaAssetId": "uuid",
    "status": "queued",
    "aspectRatio": "9:16",
    "smoothingFactor": 0.3,
    "progressPercent": null,
    "deepLink": "/media/{id}?platformProjectId=…"
  }
}
```

Errors: `401`, `403` `collection_access_denied`, `404`, `400` `invalid_payload`, `503` queue/storage.

## `GET /api/media/:mediaAssetId/reframes`

List reframes for the media (newest first). Bounded ≤ 50.

## `GET /api/media/:mediaAssetId/reframes/:reframeId`

Single row status (no signed URL).

## `GET /api/media/:mediaAssetId/reframes/:reframeId/download`

When `succeeded`: redirect or return short-lived signed download URL / stream.  
When not ready: `409` with current status.

## Service notes

Internal worker uses the same DB + object store; reframe-worker HTTP is private (`VIDEON_REFRAME_SERVICE_URL`).
