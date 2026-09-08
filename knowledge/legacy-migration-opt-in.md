# Legacy migration — opt-in mapping (V7)

**Status:** Accepted format · 2026-09-08  
**Spec:** `specs/domain/v7-production-rollout.md`  
**Schema:** `videon.legacy-migration.v1`  
**Parser:** `@videon-v3/contracts` → `parseLegacyMigrationMappingReport`

## Policy

- **Opt-in only.** No blanket backfill from `chbrdk/videon`.
- Every migrate row needs a unique `targetPlatformProjectId` (PLEXON Collection) and `ownerPlexonUserId` under Access Model B.
- Ambiguous, ownerless, or multi-owner collisions → `decision: quarantine` (or `skip`), never silent migrate.
- Legacy editing `Project` → v3 **Cut**; Collection remains the only user-facing project.

## Report shape

```json
{
  "schemaVersion": "videon.legacy-migration.v1",
  "source": "chbrdk/videon",
  "generatedAt": "2026-09-08T18:00:00.000Z",
  "operator": "optional@example.com",
  "notes": "optional free text",
  "entries": [
    {
      "legacyWorkspaceId": "ws_…",
      "legacyCutIds": ["proj_…"],
      "targetPlatformProjectId": "collection-uuid",
      "ownerPlexonUserId": "user-uuid",
      "decision": "migrate",
      "evidence": "ticket-or-doc-ref"
    },
    {
      "legacyWorkspaceId": "ws_orphan",
      "decision": "quarantine",
      "quarantineReason": "ownerless"
    }
  ]
}
```

### Field rules

| Field | Rule |
|-------|------|
| `schemaVersion` | Must be exactly `videon.legacy-migration.v1` |
| `generatedAt` | ISO-8601 timestamp |
| `entries[].decision` | `migrate` \| `quarantine` \| `skip` |
| `migrate` | Requires `targetPlatformProjectId`, `ownerPlexonUserId`, `legacyWorkspaceId` |
| `quarantine` | Requires `quarantineReason` (non-empty) |
| `skip` | Requires `legacyWorkspaceId`; optional reason in `quarantineReason` or `evidence` |
| Uniqueness | No duplicate `legacyWorkspaceId`; no two migrate rows sharing the same `legacyCutIds` entry |

## Quarantine queue

Quarantined rows stay out of production import. Resolve by:

1. Establishing Collection ownership in PLEXON, or
2. Explicit `skip` with legal/product sign-off, or
3. Hold until retention policy allows discard.

## Importer contract (when tooling lands)

1. Parse report with `parseLegacyMigrationMappingReport` — reject entire file on schema failure.
2. Import only `decision=migrate` in a dry-run then apply pass.
3. Idempotent on `(source, legacyWorkspaceId)` → target workspace upsert.
4. Never invent Collections; target must already exist (or be created via normal PLEXON Collection create + VIDEON provision).

## N/A

If no legacy migration is planned for this environment, record in `v7-staging-exercise-log.md`:

`Legacy mapping: N/A — fresh v3 island only.`
