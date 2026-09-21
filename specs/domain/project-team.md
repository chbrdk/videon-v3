# Collection team (VIDEON)

**Status:** Accepted — 2026-09-19
**Parent:** PLEXON `collection-members.md` / `collection-invite-links.md` · `specs/domain/videon-ui-surfaces.md`
**Parity:** CHECKION `ProjectTeamPanel`, Audion `CompactEditableList`

## Goal

Show who holds Access Model B access to the active Collection and allow, from VIDEON:

1. Add by email — an existing same-company PLEXON user becomes an additive Collection assignment.
2. Mint a Collection invite link (draft email → optional `toEmail` so PLEXON sends the invite).
3. Revoke an assignment (never the Collection creator).

## SSOT

PLEXON owns the Collection roster. VIDEON is a client:

- Reads and writes go to `/api/platform/provisioning/collections/:platformProjectId/members|invites`
  via `apps/web/lib/collection-members-plexon.ts`.
- `videon_workspace_members` remains a **read projection**. It is written only by the PLEXON
  provisioning replay in `apps/web/lib/db/workspaces.ts` (`upsertWorkspace` deletes and re-inserts
  the authoritative provisioning body). The team surface must never insert, update, or delete rows
  there — a membership added here becomes local only after PLEXON replays provisioning.
- Consequence: the roster the panel shows can be ahead of the local projection for one replay cycle.
  That is intended; the panel never reads from the local table.

## Surface

VIDEON has no `/projects/:id` capability page — the Collection *is* the active context. The team
lives as a thin aside on the Projekte hub (`components/collections-switcher-hub.tsx`), bound to the
active `platformProjectId` from `CollectionContextProvider`.

- Composition: `Panel` + `SectionChrome` with numbered magazine rows, an **inline draft email row**
  opened by "Add member" (no persistent `Field`), and the invite link as secondary foot action.
- No active Collection, or a non-UUID id: empty state asking the operator to pick a project.
- Creator rows (`status: 'owner'`) have no remove action.

## BFF

Routes are keyed by `platformProjectId`, not a local workspace id.

| Method | Path |
|--------|------|
| GET / POST | `/api/collections/:platformProjectId/members` |
| DELETE | `/api/collections/:platformProjectId/members/:userId` |
| POST | `/api/collections/:platformProjectId/invites` |

Gate: `authorizeCollectionTeamRequest` (`apps/web/lib/collection-team-access.ts`) — session or
service actor via `requireSessionUserId`, `platformProjectId` must be a real Collection UUID, and
the id must appear in the caller's `accessible-collections` directory. This is the authoritative
half of `resolveAccessibleWorkspace`; the team surface deliberately stops there so it never
provisions or mutates local workspace rows.

Fail closed:

| Condition | Response |
|-----------|----------|
| No actor | `401 service_unauthorized` |
| Non-UUID `platformProjectId` / missing email | `400 invalid_payload` |
| Directory unreachable | `503 dependency_unavailable` (retryable) |
| Collection not in directory | `403 collection_access_denied` |
| PLEXON 401/403 | `403 collection_access_denied` |
| PLEXON 404 | `404 not_found` |
| Federation off / upstream 5xx | `503 dependency_unavailable` (retryable) |

## Tests

- `apps/web/__tests__/collection-team-api.test.ts` — gate + upstream status mapping.
- `apps/web/__tests__/collection-team-panel.test.ts` — panel composition, locale keys, and the
  invariant that no team code touches `videon_workspace_members`.
