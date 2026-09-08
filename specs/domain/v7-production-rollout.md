# V7 — Production rollout and legacy disposition

**Status:** Accepted for in-repo operator artifacts (2026-09-08)  
**Upstream gate:** `plexon-v3/specs/domain/videon-integration.md` § V7  
**Federation:** `2026-05-plexon-federation-v3`  
**Operator SoT:** `knowledge/v7-production-runbook.md`

## Scope

V7 is an **ops / production gate**, not a feature wave. In-repo deliverables:

1. Production / staging runbook with rollback, retention, canary, and on-call.
2. Staging exercise matrix E1–E6 with an evidence log.
3. Legacy migration **opt-in** mapping report (`videon.legacy-migration.v1`) + quarantine rules.
4. Cross-links from PLEXON Collection Flow / federation knowledge.

Out of scope until stakeholder sign-off:

- Live production canary on customer tenants.
- Blanket legacy data backfill.
- Force-enable `CAPABILITY_CATALOG_RUNTIME`.
- Deleting the legacy `chbrdk/videon` Coolify app before the export/rollback window closes.

## Requirements (EARS)

- WHEN staging E1–E6 are incomplete, the system MUST NOT claim the V7 gate is closed.
- WHEN a legacy workspace/cut lacks a unique Collection + owner mapping, the importer MUST quarantine (not migrate).
- WHEN OpenRouter / vision is unavailable, new analysis MUST fail closed or queue-for-later; library / read / export MUST remain available.
- WHEN canary metrics breach objectives, operators MUST halt Collection expansion and roll vision back independently of app deploy.
- WHERE no legacy migration is planned, the mapping report MAY be marked N/A; quarantine rules still apply if a migration is later requested.

## Mapping report contract

Schema id: `videon.legacy-migration.v1`  
Parser: `packages/contracts` → `parseLegacyMigrationMappingReport`  
Knowledge: `knowledge/legacy-migration-opt-in.md`

## Gate

Same sign-off checklist as upstream § V7. Closing the gate requires named owners and dated evidence in `knowledge/v7-staging-exercise-log.md` (or linked ticket), not docs alone.
