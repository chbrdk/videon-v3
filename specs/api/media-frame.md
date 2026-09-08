# Media frame (assistant poster)

**Status:** Accepted — 2026-09-08 (cache)  
**Route:** `GET /api/media/:mediaAssetId/frame`  
**Companions:** `specs/domain/mcp-server.md` · `media-preview.md` · PLEXON `assistant-videon-mcp.md` · `assistant-videon-hit-chrome.md`  
**Auth:** Access Model B via `requireSessionUserId` (session, Bearer token, or service secret + `X-Plexon-User-Id`)

## Purpose

Return a single JPEG still from a media asset at timestamp `t` (ms) for Plexon assistant `video_hit_strip` posters. Not for streaming playback.

## Query

| Param | Required | Notes |
|-------|----------|-------|
| `platformProjectId` | Yes | Collection scope |
| `t` | No | Seek ms (default `1000`; clamped ≥ 0) |

## Response

- `200` `image/jpeg` (bounded; scaled for chat posters)  
- `401` / `403` / `404` / `409` / `503` as other media routes  

## Server cache

1. WHEN a frame is extracted THEN the server MUST cache by key `(workspaceId, mediaAssetId, tMs, maxWidth)` with TTL ≥ 5 minutes (process-local OK for Phase 1).  
2. WHEN cache hits THEN the response MUST still enforce Model B on every request (auth before cache read).  
3. Cache MUST store JPEG bytes only — never storage keys that become public signed URLs.

## Guarantees

1. WHEN the caller lacks Model B access THEN the route MUST fail closed.  
2. WHEN storage/ffmpeg is unavailable THEN it MUST return `503` retryable — NOT invent a placeholder image as success.  
3. WHEN responding THEN it MUST NOT return video bytes, stems, or signed object URLs.

## Acceptance

1. Paths documented in `paths.ts` / `knowledge/paths.md`.  
2. Service-secret + actor can fetch a frame for an accessible asset.  
3. Plexon proxy `/api/assistant/videon-frame` consumes this route.  
4. Unit/smoke: cache key reuse avoids second ffmpeg when warm.
