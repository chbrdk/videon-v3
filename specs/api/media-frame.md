# Media frame (assistant poster + editor posters)

**Status:** Accepted — 2026-09-08 (cache); Wave 4 eager S3 posters — see `specs/domain/cut-editor-load-performance.md`  
**Route:** `GET /api/media/:mediaAssetId/frame`  
**Companions:** `specs/domain/mcp-server.md` · `media-preview.md` · `cut-editor-load-performance.md` · PLEXON `assistant-videon-mcp.md` · `assistant-videon-hit-chrome.md`  
**Auth:** Access Model B via `requireSessionUserId` (session, Bearer token, or service secret + `X-Plexon-User-Id`)

## Purpose

Return a single JPEG still from a media asset at timestamp `t` (ms) for:

1. Plexon assistant `video_hit_strip` posters  
2. **Cut editor** Bin / timeline poster slots (primary source — NOT client video capture)

Not for streaming playback.

## Query

| Param | Required | Notes |
|-------|----------|-------|
| `platformProjectId` | Yes | Collection scope |
| `t` | No | Seek ms (default `1000`; clamped ≥ 0; bucketed to 250 ms for cache keys) |
| `w` | No | Max width tier: `160` (Bin), `240` (timeline), `480` (default / evidence / assistant). Other values snap to nearest tier. |

## Response

- `200` `image/jpeg` (bounded; scaled to `w`)  
- Headers: `Cache-Control: private, max-age=86400`, `ETag`, `X-Videon-Frame-Cache: s3|memory|miss`  
- `401` / `403` / `404` / `409` / `503` as other media routes  

## Serve order

1. Auth + Model B (always before any cache/storage read).  
2. Process-local memory cache.  
3. Eager / write-through object at `{workspace}/media/{id}/posters/w{w}/t{bucketedMs}.jpg`.  
4. Download source → ffmpeg extract → memory cache → write-through to object storage.

## Server cache

1. WHEN a frame is extracted THEN the server MUST cache by key `(workspaceId, mediaAssetId, tMs, maxWidth)` with TTL ≥ 5 minutes (process-local OK).  
2. WHEN cache hits THEN the response MUST still enforce Model B on every request (auth before cache read).  
3. Cache MUST store JPEG bytes only — never storage keys that become public signed URLs.  
4. Analysis MUST warm mid-point + scene-start posters into object storage (Wave 4).

## Guarantees

1. WHEN the caller lacks Model B access THEN the route MUST fail closed.  
2. WHEN storage/ffmpeg is unavailable THEN it MUST return `503` retryable — NOT invent a placeholder image as success.  
3. WHEN responding THEN it MUST NOT return video bytes, stems, or signed object URLs.

## Acceptance

1. Paths documented in `paths.ts` / `knowledge/paths.md`.  
2. Service-secret + actor can fetch a frame for an accessible asset.  
3. Plexon proxy `/api/assistant/videon-frame` consumes this route.  
4. Unit/smoke: cache key reuse avoids second ffmpeg when warm.  
5. Wave 4: S3 poster hit returns without source download; `w` tiers documented.
