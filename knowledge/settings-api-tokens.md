# Settings API tokens

**Spec:** `specs/domain/settings-api-tokens.md`  
**Prefix:** `videon_` (see `paths.apiTokenPrefix`)  
**Routes:** `GET/POST /api/tokens`, `DELETE /api/tokens/:id`, `POST /api/tokens/verify`  
**Table:** `api_tokens` (`migrations/0017_api_tokens.sql`)

Optional Bearer tokens for **Cursor / direct** MCP and the Adobe panel. Tools then run as the token owner under Access Model B.

Plexon assistant auth is separate: service secret + dynamic `actorUserId` per chat user (`knowledge/mcp-server.md`).

## Owner discovery

The owner is **on the token row**. Flow:

1. Operator creates a token while logged into VIDEON Settings (session → `owner_id`).
2. Panel / MCP sends `Authorization: Bearer videon_…`.
3. `POST /api/tokens/verify` (or any Product route via `requireSessionUserId`) resolves `ownerId` from the hash — no separate owner field in the panel.

## Staging

| Key | Role |
|-----|------|
| `VIDEON_BOOTSTRAP_API_TOKEN` | Optional durable seed secret |
| `VIDEON_BOOTSTRAP_API_OWNER_ID` | Only for cold first seed of that secret; skipped when the hash already exists in `api_tokens` |

After deploy, create a fresh token in Settings once — it survives restarts via Postgres. Adobe panel connection test should show `Health OK · owner <id>` after verify.
