# Settings API tokens

**Spec:** `specs/domain/settings-api-tokens.md`  
**Prefix:** `videon_` (see `paths.apiTokenPrefix`)  
**Routes:** `GET/POST /api/tokens`, `DELETE /api/tokens/:id`, `POST /api/tokens/verify`

Optional Bearer tokens for **Cursor / direct** MCP (`VIDEON_API_TOKEN`). Tools then run as the token owner under Access Model B.

Plexon assistant auth is separate: service secret + dynamic `actorUserId` per chat user (`knowledge/mcp-server.md`).

## Staging caveat (Phase 1 in-memory)

Tokens created in VIDEON Settings live only in the Node process. **Coolify redeploys wipe them.**

Durable staging seed needs **both** env keys on `videon-v3:main-app` (`mi0j3pyjrel80jodebwvhgvi`):

| Key | Role |
|-----|------|
| `VIDEON_BOOTSTRAP_API_TOKEN` | Full `videon_` + 64 hex |
| `VIDEON_BOOTSTRAP_API_OWNER_ID` | Plexon user id (≥ 8 chars) — **required**; without it bootstrap is a no-op |

Adobe panel `service_unauthorized` after Health OK almost always means: token missing from the in-memory store (restart) or wrong format. Fix: create a fresh token under `/settings`, paste into the panel, or complete bootstrap env + restart.
