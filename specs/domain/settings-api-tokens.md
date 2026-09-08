# API tokens (Settings)

**Status:** Accepted — Phase 1 (fixture store)  
**UI:** `/settings` API-tokens band  
**Knowledge:** `knowledge/settings-api-tokens.md` · `knowledge/paths.md`  
**MCP:** `specs/domain/mcp-server.md`

## Purpose

Personal Bearer tokens (`videon_` + 64 hex) for MCP / machine Product-API access under Access Model B (token owner = Plexon user id).

## Model

| Field | Notes |
|-------|--------|
| `id` | Opaque (`tok-…`) |
| `label` | Display |
| `prefix` | Visible only (`videon_` + 4 hex) |
| `ownerId` | Session user id |
| `tokenHash` | SHA-256 of raw token |
| `createdAt` / `lastUsedAt` | ISO |

Raw secret returned **once** on create. Phase 1 = in-memory fixture store (survives process lifetime); Postgres `api_tokens` deferred.

### Bootstrap (staging MCP)

Optional env seed so Coolify MCP can call Product without UI create after each restart:

| Key | Notes |
|-----|--------|
| `VIDEON_BOOTSTRAP_API_TOKEN` | Full `videon_` + 64 hex — same value as MCP `VIDEON_API_TOKEN` |
| `VIDEON_BOOTSTRAP_API_OWNER_ID` | Plexon user id (Access Model B membership) |

Applied lazily on Bearer resolve via `ensureBootstrapApiToken()`.

## Auth resolution

`requireSessionUserId()` resolves Bearer via `Authorization` header first, then session. Routes stay fail-closed on Model B after user id is known.

## Acceptance

1. Create / list / revoke / verify roundtrip.  
2. Bearer on `GET /api/media/search` authenticates as token owner.  
3. Paths only via `paths.ts`.
