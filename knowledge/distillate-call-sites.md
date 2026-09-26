# Destillat Call-Sites — VIDEON

**Spec:** `plexon-v3/specs/domain/suite-enterprise-program.md` § E1 / E4  
**Clients:** `apps/web/lib/plexon-suite-audit.ts` · `apps/web/lib/plexon-collection-activity.ts`

| Trigger | File | Activity | Audit | Notes |
|---|---|---|---|---|
| Analysis pipeline finish | `apps/web/lib/pipeline/run-analysis.ts` | `scheduleCollectionActivityDistillate` | `scheduleSuiteAuditEvent` | Media analysis |
| Cut ClientRoom approve | `apps/web/app/api/cuts/[cutId]/client-room-approve/route.ts` | — | `scheduleSuiteAuditEvent` | + Share-Links Hub |
