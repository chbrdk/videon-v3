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
4. WHEN the open chat surface lays out THEN the panel/turns MUST use the stage width (Audion/Plexon pattern: override DS `chat-panel-open` 56/52/36rem caps) with a soft ultra-wide max (~112rem); user turns stay readable; assistant hit grids stretch full row.
5. WHEN the operator submits a query THEN the hub MUST call `GET /api/media/search` (optional `platformProjectId`; without it → all accessible projects, fail-closed like Mediathek).
6. WHEN the query is natural language THEN the server MUST strip filler words, expand domain concepts (e.g. dashboard/UI), and match with OR-prefix `to_tsquery` plus `ILIKE` fallback — NOT `plainto_tsquery` AND of the full sentence.
7. WHEN hits render THEN they MUST use `@msqdx/ui` `StepStrip` / `StepStripItem` (Audion UX-journey magazine strip) — horizontal scroll-snap teasers with hover/focus expand (larger frame) — NOT a dense Mediathek card grid.
8. WHEN a hit teaser activates (click / Enter) THEN it MUST deep-link to the media editor with seek (`t` ms and/or `scene` key) and land the playhead on that scene.
9. Cuts remain reachable from Mediathek/editor; Upload remains from Mediathek project actions — not primary rail.
