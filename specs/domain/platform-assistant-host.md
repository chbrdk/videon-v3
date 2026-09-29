# Platform Assistant host (FAB)

**Status:** Accepted — 2026-09-08  
**Product:** VIDEON v3  
**Companions:** `videon-ui-surfaces.md` · `scene-chat.md` · PLEXON `specs/api/assistant-embed.md` · `specs/domain/central-assistant-flyout.md` · `specs/domain/assistant-videon-mcp.md`  
**Implements:** `apps/web/components/platform-assistant-host.tsx` · `lib/platform-assistant-paths.ts`

## Purpose

Mount the **Plexon central assistant** as a bottom-end FAB + `ChatOverlay` iframe — same island pattern as Audion / Brandion / Checkion. Independent of the in-app `/chat` scene-retrieval hub.

## Guarantees

1. WHEN an authenticated `AppShell` renders THEN it MUST mount `AssistantPageContextProvider` + `PlatformAssistantHost`.  
2. WHEN `NEXT_PUBLIC_PLEXON_URL` (or fallback base/auth URL) is unset THEN the host MUST render nothing (fail soft).  
3. WHEN the FAB opens THEN the overlay MUST load `{plexonBase}/assistant/embed?product=videon` with optional `project` (= active Collection UUID), `pathname`, `theme`, entity, and conversation id — never a hardcoded Plexon origin.  
4. WHEN Collection / entity context changes WHILE open THEN the host MUST post `assistant:context` (and on `assistant:ready`).  
5. WHEN theme on the host document changes THEN the host MUST post `assistant:theme` to the embed (protocol in `assistant-embed.md`).  
6. WHEN expand / close messages arrive from the embed THEN the host MUST open Plexon `/assistant` or close the overlay accordingly.  
7. Media / Cut editors MUST publish Collection + entity (`media` / `cut`) via `AssistantPageContextPublisher`. Local path ids are never Collection — only real Plexon UUIDs.  
8. Agent tool calls from this surface use MCP with per-session `actorUserId` (`mcp-server.md`) — NOT a fixed Settings API token.

## Non-goals

- Replacing `/chat` scene search UI  
- Embedding LLM chrome inside VIDEON (orchestration stays in Plexon)

## Acceptance

1. Unit: embed URL includes `product=videon`; shell mounts Provider + host; media/cut editors publish context.  
2. Staging: FAB visible bottom-end; open shows Plexon embed with Collection; scene Q&A can use VIDEON MCP tools for the logged-in user.

**SSOT suite:** `plexon-v3/specs/domain/assistant-page-context.md` · rollout `plexon-v3/knowledge/assistant-page-context-rollout.md`
