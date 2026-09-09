# Media list API

**Status:** Active  
**Product:** VIDEON v3  
**Companion:** `specs/domain/videon-ui-surfaces.md`, Access Model B

## `GET /api/media`

### Project-scoped (existing)

`?platformProjectId={id}` — list media for that workspace after `resolveAccessibleWorkspace`.

### Accessible Mediathek (default)

Without `platformProjectId`:

1. Require session.
2. Load PLEXON accessible Collections for the user (`accessible-collections`). Directory unavailable → `503`. Empty → `{ scope: "accessible", items: [] }`.
3. List media only for workspaces whose `platform_project_id` is in that allowlist **and** the user can read (owner or `videon_workspace_members`). Compare as `uuid[]` / `uuid` (columns are UUID, not text).
4. Each item MUST include `platformProjectId` (and SHOULD include `projectName` from the directory).
5. Each item SHOULD include `sceneCount` (distinct `scene_key`s on the latest succeeded analysis run) for Bin/Mediathek card chrome.
6. Never accept a client-supplied allowlist of project ids.

Writes, detail, stream, search, upload remain project-scoped.
