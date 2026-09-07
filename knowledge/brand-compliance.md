# Brand compliance (VIDEON ↔ Brandion)

Normative behaviour: `plexon-v3/specs/domain/videon-integration.md` § Brand compliance seam.

VIDEON describes media (scene insight + evidence frames). Brandion owns guideline truth. VIDEON never invents a synthetic pass.

## Pipeline stage

Stage key: `brand_compliance` (after `vision`, before `aggregate`).

Runs:

1. After a full media analysis (`videon.media.analysis`).
2. Standalone via job `videon.media.brand_compliance` without re-running vision.

Entry points:

| Path | Purpose |
|------|---------|
| Analysis pipeline | `executeBrandCompliance` from `run-analysis.ts` |
| `POST /api/media/:id/brand-check?platformProjectId=` | Re-check existing scene insights |
| Toolbar **Brand-Check** | UI for the POST above |

Requires a **succeeded** analysis with at least one scene insight.

## Config

Resolved in `apps/web/lib/runtime-config.ts` / `paths.ts`:

| Env | Role |
|-----|------|
| `BRANDION_API_URL` | Preferred server-side Brandion origin |
| `NEXT_PUBLIC_BRANDION_URL` | Fallback origin (UI product switcher) |
| `PLEXON_SERVICE_SECRET` | Machine auth to Brandion |

`isBrandionCheckConfigured()` = API origin + service secret. If unset → status `queued_pending_brandion`, reason `brandion_unconfigured`.

Coolify: set `BRANDION_API_URL` on the VIDEON app/worker explicitly when the public URL differs from the internal route.

## Brandion calls

1. `GET /api/guidelines/active-pack?platformProjectId=…`  
   Headers: federation contract + `X-Service-Secret` (+ optional user header).
2. Per evidence frame: `POST /api/guidelines/:guidelineId/analysis-runs`  
   Body: `input.kind: "image"`, JPEG base64, `ocr: true`, optional `pathMap` from brand candidates → pack tokens.

No active guideline → scene status `skipped` (`no_active_guideline`) with operator hint.

## Multi-frame evidence

Brandion accepts **one image per analysis-run**. VIDEON therefore:

1. Selects up to **3** frames (`MAX_BRAND_EVIDENCE_FRAMES` in `lib/brand-findings.ts`).
2. Prefers frames referenced by `brandCandidates.evidenceFrameIds`, then remaining scene `frame_refs`, else scene midpoint.
3. Re-extracts JPEGs from source media at those timestamps.
4. Runs one Brandion image check per extracted frame.
5. Aggregates worst-case: `fail` > `queued_pending_brandion`/`running` > `warn` > `skipped` > `pass`.

Stored under `media_brand_checks`:

- `evidence_frame_refs` — selected refs
- `result.frameRuns` — per-frame status + Brandion run id
- `provenance.evidenceFrameCount` / `evidenceTimestampsMs` / `frameStatuses`

## Status meanings

| Status | Meaning |
|--------|---------|
| `queued_pending_brandion` | Config/upstream/extract issue — retry later; not a pass |
| `running` | Stage in progress |
| `pass` / `warn` / `fail` | Aggregated Brandion evaluate outcome |
| `skipped` | No Collection active guideline |

## UI

- Media editor toolbar: **Brand-Check** (polls while stage `brand_compliance` is running).
- Scene inspector: badge, guideline id or “keine Guideline”, reason/hint, evidence-frame count, Brandion findings.
- Media detail API returns `brandChecks` via `toBrandCheckView`.

## Code map

| Module | Role |
|--------|------|
| `lib/pipeline/run-brand-compliance.ts` | Stage execution + standalone runner |
| `lib/brandion-client.ts` | Active-pack + single/multi image runs |
| `lib/brand-findings.ts` | Frame select, status aggregate, UI view, pathMap |
| `lib/db/brand-checks.ts` | `media_brand_checks` persistence |
| `lib/jobs/pg-boss-queue.ts` | `enqueueBrandComplianceJob` / handler |
| `migrations/0007_media_brand_checks.sql` | Table |

## Ops checklist

1. Migration `0007_media_brand_checks` applied.
2. `BRANDION_API_URL` + `PLEXON_SERVICE_SECRET` on web **and** worker.
3. Collection has an Active-Pack in Brandion.
4. Succeeded analysis → Brand-Check or re-run analysis.
5. Inspector shows findings or an explicit skip/pending reason — never a silent pass.
