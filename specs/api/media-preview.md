# Media preview (assistant hover)

**Status:** Accepted — 2026-09-08  
**Route:** `GET /api/media/:mediaAssetId/preview`  
**Companions:** `media-frame.md` · PLEXON `assistant-videon-hit-chrome.md`  
**Auth:** Access Model B via `requireSessionUserId`

## Purpose

Return a short muted video segment (MP4) around timestamp `t` for assistant hover preview. Not a general streaming API.

## Query

| Param | Required | Notes |
|-------|----------|-------|
| `platformProjectId` | Yes | Collection scope |
| `t` | No | Center ms (default `1000`) |
| `durationMs` | No | Clip length; default `3000`; max `3000` |

## Response

- `200` `video/mp4` (bounded clip)  
- Auth / missing media errors as frame route  

## Guarantees

1. WHEN duration exceeds max THEN the server MUST clamp to `3000`.  
2. WHEN extraction fails THEN `503` retryable — NOT a silent empty 200.  
3. WHEN responding THEN it MUST NOT return stems, full asset, or signed object URLs to the client (bytes are the clipped MP4 only).

## Acceptance

1. Paths in `paths.ts` / `knowledge/paths.md`.  
2. Plexon `/api/assistant/videon-preview` proxies this route.
