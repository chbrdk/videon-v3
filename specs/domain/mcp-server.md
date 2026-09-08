# VIDEON v3 MCP Server

**Status:** Draft — 2026-09-08 (Phase 1 read)  
**Implements:** `mcp-server/` (planned — Streamable HTTP + stdio)  
**Knowledge:** `knowledge/mcp-server.md` · `knowledge/paths.md`  
**Companions:** `specs/domain/scene-chat.md` · PLEXON `specs/domain/videon-integration.md` · `specs/domain/assistant-videon-mcp.md`  
**Federation:** `2026-05-plexon-federation-v3`

## Purpose

Expose VIDEON product APIs as MCP tools for the **Plexon central assistant** (and Cursor). Separate deployable from `apps/web` — same island pattern as Brandion/Checkion/Audion `mcp-server/`.

The in-app `/chat` hub (Phase 1 scene retrieval UI) remains independent. MCP is the agent surface; both may call the same Product APIs.

## Transport

| Mode | Env | Use |
|------|-----|-----|
| Streamable HTTP (default) | `MCP_PORT` (default **3103**), optional `MCP_STATELESS=1` | Plexon / Coolify / Cursor |
| stdio | `MCP_TRANSPORT=stdio` | Local / Claude Desktop subprocess |

## Env

| Key | Required | Notes |
|-----|----------|-------|
| `VIDEON_API_URL` | Yes | Base URL of videon-v3 web (no trailing slash) |
| `VIDEON_API_TOKEN` | Yes* | Settings API token (`videon_` + secret) — user-scoped Product calls |
| `MCP_TRANSPORT` | No | `stdio` or omit/`http` |
| `MCP_PORT` | No | Default `3103` (avoid Brandion `3100` / Echon `3101` / Creation `3102`) |
| `MCP_STATELESS` | No | `1` behind reverse proxies that drop MCP session headers |

\* Phase 1 auth is **locked**: Settings API tokens only (`specs/domain/settings-api-tokens.md`). Token owner = Plexon user id; Access Model B fail-closed. Session-cookie forwarding from the browser is **out of scope** for the MCP process. Service-secret interim is **not** used for MCP→Product in Phase 1.

### Auth decision (locked)

1. **Settings API tokens** (mirror Brandion) + Collection ACL via token owner.  
2. ~~Interim service secret~~ — deferred / not used for MCP Phase 1.  
3. Session-cookie forwarding from the browser is **out of scope** for the MCP process.

## Capability catalog alignment

| Catalog id (`videon-integration.md`) | MCP tools (Phase) |
|--------------------------------------|-------------------|
| `videon.media.search` | `videon.media_search` (P1) |
| `videon.analysis.get` | `videon.analysis_get`, `videon.media_get` (P1) |
| `videon.analysis.run` | `videon.analysis_run` (P2) |
| `videon.cut.create` | `videon.cut_create` (P2) |
| `videon.export.run` | `videon.export_run` (P2 / Flow-first) |
| `videon.reframe.run` | deferred |

## Tool surface

Prefix: `videon.` (Anthropic names: `videon_*` after underscore conversion in Plexon’s MCP client).

### Phase 1 — Read

| Tool | Maps to | Inputs (summary) | Notes |
|------|---------|------------------|--------|
| `videon.health` | `GET /api/health` | — | Liveness |
| `videon.projects_list` | `GET /api/collections` | — | Accessible Collections (Model B) |
| `videon.media_search` | `GET /api/media/search` | `q` (required), optional `platformProjectId`, `limit?` | NL scene search; same query plan as in-app chat (`scene-search-query`) |
| `videon.media_list` | `GET /api/media` | optional `platformProjectId` | Without project → accessible scope |
| `videon.media_get` | `GET /api/media/:id` | `mediaAssetId`, `platformProjectId` | **Bounded** summary: lifecycle, analysis status, scene list (`sceneKey`, `startMs`, `endMs`, short text), **not** full transcript / stems / binary URLs |
| `videon.analysis_get` | `GET /api/analyses` and/or detail stages | `platformProjectId`, optional `mediaAssetId` | Run + stage status short form |
| `videon.cuts_list` | `GET /api/cuts` | `platformProjectId` | Cut titles + ids + deep links |
| `videon.cut_get` | `GET /api/cuts/:id` | `cutId`, `platformProjectId` | Bounded cut meta + clip count — not full timeline payload |

#### Result contract (mandatory)

Every hit/detail that can open the product MUST include stable deep links:

- Media / scene: `/media/{mediaAssetId}?platformProjectId={id}&t={startMs}&scene={sceneKey}` when timing known  
- Library: `/library?platformProjectId={id}`  
- Analyses: `/analyses?platformProjectId={id}`  
- Cuts: `/cuts/{cutId}?platformProjectId={id}` (or list hub)

**Forbidden in MCP payloads:** video/audio bytes, stem streams, signed object URLs, full transcripts, unbounded per-frame / heatmap dumps.

Hard limits (initial): `media_search` ≤ 20 hits; `media_get` scene list ≤ 40 entries with truncated `searchText` (≤ 200 chars each).

### Phase 2 — Write / jobs (deferred implement)

| Tool | Maps to | Notes |
|------|---------|--------|
| `videon.analysis_run` | `POST /api/media/:id/analysis` | Returns job/run ref; poll via `analysis_get` |
| `videon.brand_check_run` | `POST /api/media/:id/brand-check` | Optional |
| `videon.cut_create` | `POST /api/cuts` | Chat confirmation required (Plexon write policy) |
| `videon.export_run` | `POST /api/cuts/:id/exports` | Prefer Collection Flow first |

Writes require writable membership + idempotency keys where the Product API supports them.

## Agent guidance (for tool descriptions)

For “finde Szene / Video / Dashboard / Interview…”:

1. Prefer `videon.media_search` with the user phrasing (server expands NL as in Product).  
2. Optionally scope with `platformProjectId` from page context / prior `projects_list`.  
3. Answer with short narrative + cite deep links (`t` / `scene`) — do not invent timestamps.  
4. For status questions, use `media_get` / `analysis_get` rather than re-searching.

## Non-goals

- Replacing Federation provisioning / health contract  
- Driving the NLE UI remotely (seek = deep link)  
- Embedding LLM inside VIDEON MCP (orchestration stays in Plexon)  
- Knowledge-pack publisher (`media_insights`) until Collection Knowledge Pack specs land  
- Upload / delete media via MCP in Phase 1

## Acceptance

1. Spec reviewed; `knowledge/paths.md` lists planned `mcp-server/` + env keys.  
2. Phase 1 tool table matches Product routes that exist today.  
3. Implementation ships: `mcp-server/` build + inventory test + Coolify Dockerfile; `videon.health` + `videon.media_search` round-trip on staging with Model B user.  
4. Plexon wiring per `assistant-videon-mcp.md` (env gate + families + orchestrator fetch).
