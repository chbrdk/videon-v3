# VIDEON MCP (agent surface)

**Status:** Draft — 2026-09-08  
**Spec:** `specs/domain/mcp-server.md`  
**Plexon wire-up:** `plexon-v3/specs/domain/assistant-videon-mcp.md`

## Summary

Streamable-HTTP MCP service (`mcp-server/`) that proxies Access Model B Product APIs for the Plexon assistant. Phase 1 = read tools (`media_search`, `media_get`, analyses/cuts list). Results are summaries + deep links only.

Auth: Settings API tokens (`VIDEON_API_TOKEN` = `videon_…` from Settings). Token owner scopes Collection ACL.

## Related

- In-app scene chat UI: `specs/domain/scene-chat.md` (not an LLM agent)  
- Catalog capabilities: PLEXON `specs/domain/videon-integration.md` § Capability catalog  
- Env / Coolify: `knowledge/paths.md` (MCP port **3103**)
