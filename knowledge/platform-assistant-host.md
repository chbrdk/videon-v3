# Platform Assistant FAB

**Spec:** `specs/domain/platform-assistant-host.md`  
**Plexon:** `assistant-embed.md` · `assistant-videon-mcp.md`

Authenticated AppShell mounts `PlatformAssistantHost`: FAB bottom-end → `ChatOverlay` iframe to `{NEXT_PUBLIC_PLEXON_URL}/assistant/embed?product=videon` (+ active `project`). In-app `/chat` stays scene retrieval only.
