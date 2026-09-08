# VIDEON MCP server

Phase 1+2 tools for Plexon assistant. Spec: `../specs/domain/mcp-server.md`

**Assistant (default):** `PLEXON_SERVICE_SECRET` + per-call `actorUserId` (injected by Plexon).  
**Cursor / direct (optional):** `VIDEON_API_TOKEN` from Settings → API tokens.

```bash
cd mcp-server
npm ci
export VIDEON_API_URL=https://videon.projects-a.plygrnd.tech
export PLEXON_SERVICE_SECRET=…   # same as videon-v3 web / plexon
# optional for Cursor: export VIDEON_API_TOKEN=videon_…
export MCP_STATELESS=1
export MCP_PORT=3103
npm run build && npm start
```
