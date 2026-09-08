# Settings API tokens

**Spec:** `specs/domain/settings-api-tokens.md`  
**Prefix:** `videon_` (see `paths.apiTokenPrefix`)  
**Routes:** `GET/POST /api/tokens`, `DELETE /api/tokens/:id`, `POST /api/tokens/verify`

Optional Bearer tokens for **Cursor / direct** MCP (`VIDEON_API_TOKEN`). Tools then run as the token owner under Access Model B.

Plexon assistant auth is separate: service secret + dynamic `actorUserId` per chat user (`knowledge/mcp-server.md`).
