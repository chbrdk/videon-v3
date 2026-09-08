# Scene chat (Phase 1)

**Status:** Active  
**Product:** VIDEON v3  
**Companion:** `videon-ui-surfaces.md`, Audion chat chrome (`@msqdx/ui` `chat.css`)

## Purpose

Operator chat hub to **search scenes** across accessible projects (Access Model B). Phase 1 is retrieval over `media_search_entries` — not LLM streaming.

## Guarantees

1. WHEN the NavRail renders THEN PRIMARY MUST include **Chat** (Audion-style bubble icon) and MUST NOT list Upload or Cuts as primary peers (routes remain for deep links / editor).
2. WHEN the Projekte rail item renders THEN it MUST use the shared **folder** projects icon (`NavIconProjects`) — same glyph as Checkion/Audion/Brandion — NOT a product-local box/collection glyph.
3. WHEN `/chat` opens THEN it MUST use `@msqdx/ui` chat chrome (`.chat-panel` / `.chat-turns` / `.chat-form` / composer) — NOT invent a second chat shell.
4. WHEN the operator submits a query THEN the hub MUST call `GET /api/media/search` (optional `platformProjectId`; without it → all accessible projects, fail-closed like Mediathek).
5. WHEN hits render THEN each hit MUST deep-link to media with `platformProjectId` and SHOULD surface `sceneKey` + time range when present.
6. Cuts remain reachable from Mediathek/editor; Upload remains from Mediathek project actions — not primary rail.
