# VIDEON MCP server

Phase 1 read tools for Plexon assistant. Spec: `../specs/domain/mcp-server.md`

```bash
cd mcp-server
npm ci
export VIDEON_API_URL=https://videon.projects-a.plygrnd.tech
export VIDEON_API_TOKEN=videon_…   # from Settings → API tokens
export MCP_STATELESS=1
export MCP_PORT=3103
npm run build && npm start
```
