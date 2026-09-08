# VIDEON MCP (agent surface)

**Status:** Live staging — 2026-09-08  
**Spec:** `specs/domain/mcp-server.md`  
**Plexon wire-up:** `plexon-v3/specs/domain/assistant-videon-mcp.md`

## Summary

Streamable-HTTP MCP (`mcp-server/`) proxies Access Model B Product APIs for the Plexon assistant.

**Assistant auth (dynamic per user):** `PLEXON_SERVICE_SECRET` + `actorUserId` injected by Plexon on each tool call → Product headers `X-Service-Secret` + `X-Plexon-User-Id`. Same pattern as CREATION.

Optional: Settings API token for Cursor/direct use only — not the assistant path.

- Phase 1 read: `media_search`, `media_get`, analyses/cuts  
- Phase 2 write/jobs: `analysis_run`, `brand_check_run`, `cut_create`, `export_run`

## Coolify

| Item | Value |
|------|--------|
| App | `videon-mcp` `pjupngbkompeyfjqocgsi0jy` |
| FQDN | `https://pjupngbkompeyfjqocgsi0jy.projects-a.plygrnd.tech` |
| Port | **3103** |
| Plexon | `VIDEON_MCP_URL` → FQDN above |
| MCP env | `VIDEON_API_URL`, `PLEXON_SERVICE_SECRET` (shared with web) |

## Related

- In-app scene chat UI: `specs/domain/scene-chat.md` (not an LLM agent)  
- Catalog: PLEXON `specs/domain/videon-integration.md` § Capability catalog  
