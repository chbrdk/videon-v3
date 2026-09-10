# Scene hit model (shared)

**Status:** Accepted — 2026-09-08  
**Product:** VIDEON v3  
**Consumers:** In-app `/chat` (`scene-chat.md`) · Plexon `video_hit_strip` (`assistant-videon-mcp.md`) · Adobe UXP Library Panel (`adobe-uxp-library-panel.md`)  
**Implements:** `apps/web/lib/scene-hit-model.ts`

## Purpose

One canonical hit shape for scene search results so Product chat and the central assistant render the same fields, deep-link query keys, and timing labels.

## Canonical fields

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Stable hit id |
| `mediaAssetId` | string | Required |
| `platformProjectId` | string | Required for deep links |
| `sceneKey` | string \| null | Editor `scene=` query |
| `mediaFilename` | string | Card title |
| `startMs` | number \| null | Editor `t=` when set |
| `endMs` | number \| null | Timing / duration |
| `searchText` | string | Snippet ≤ 200 chars in agent payloads |
| `projectName` | string \| null | Display |
| `href` | string | Relative Product path `/media/…?platformProjectId=&t=&scene=` |

## Guarantees

1. WHEN search API or MCP maps a hit THEN it MUST include `mediaAssetId` + `platformProjectId` + relative `href` with `t`/`scene` when known.  
2. WHEN Product `/chat` renders hits THEN it MUST map through `scene-hit-model` helpers (timing/scene labels).  
3. WHEN Plexon builds `video_hit_strip` THEN it MUST use the same timing/scene label semantics (absolute href via `getVideonUrl()`).  
4. WHEN timestamps are missing THEN `t` defaults for posters MAY use `1000` ms — labels MUST NOT invent clocks.

## Acceptance

1. Unit: label helpers cover scene ordinal + clock range.  
2. Deep-link query keys remain `platformProjectId`, `t`, `scene`.
