# VIDEON MCP (agent surface)

**Status:** Live staging — 2026-09-08  
**Spec:** `specs/domain/mcp-server.md`  
**Plexon wire-up:** `plexon-v3/specs/domain/assistant-videon-mcp.md`

## Summary

Streamable-HTTP MCP (`mcp-server/`) proxies Access Model B Product APIs for the Plexon assistant.

- Phase 1 read: `media_search`, `media_get`, analyses/cuts  
- Phase 2 write/jobs: `analysis_run`, `brand_check_run`, `cut_create`, `export_run`  

Auth: Settings API tokens (`VIDEON_API_TOKEN` = `videon_…`). Staging may seed via `VIDEON_BOOTSTRAP_API_TOKEN` + `VIDEON_BOOTSTRAP_API_OWNER_ID` on the web app.

## Coolify

| Item | Value |
|------|--------|
| App | `videon-mcp` `pjupngbkompeyfjqocgsi0jy` |
| FQDN | `https://pjupngbkompeyfjqocgsi0jy.projects-a.plygrnd.tech` |
| Port | **3103** |
| Plexon | `VIDEON_MCP_URL` → FQDN above |

## Related

- In-app scene chat UI: `specs/domain/scene-chat.md` (not an LLM agent)  
- Catalog: PLEXON `specs/domain/videon-integration.md` § Capability catalog  
