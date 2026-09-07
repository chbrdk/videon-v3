# Paths & env (VIDEON v3)

Canonical route and env keys live in `apps/web/lib/paths.ts` and resolvers in `apps/web/lib/runtime-config.ts`. Do not hardcode service bases in handlers or UI.

## Product

| Key | Value |
|-----|-------|
| Product id | `videon` |
| Federation contract | `2026-05-plexon-federation-v3` |
| Staging app | `https://videon.projects-a.plygrnd.tech` |
| Staging Brandion | `https://brandion-v3.projects-a.plygrnd.tech` |

## Brandion seam

| Constant / env | Path or meaning |
|----------------|-----------------|
| `BRANDION_API_URL` | Server Brandion origin (preferred) |
| `NEXT_PUBLIC_BRANDION_URL` | Public Brandion URL / fallback API origin |
| `brandionActivePackPath` | `/api/guidelines/active-pack` |
| `brandionAnalysisRunsPath(id)` | `/api/guidelines/:id/analysis-runs` |
| `activePackQueryKey` | `platformProjectId` |
| `apiMediaBrandCheck(mediaId, projectId)` | `POST /api/media/:id/brand-check?platformProjectId=` |

Details: [`brand-compliance.md`](./brand-compliance.md).

## Media API (Collection-scoped)

All require auth + `platformProjectId` (except noted).

| Route helper | HTTP |
|--------------|------|
| `apiMediaDetail` | `GET`/`DELETE` media |
| `apiMediaPlayback` / `apiMediaStream` | Playback |
| `apiMediaAnalysis` | `POST` full analysis re-run |
| `apiMediaBrandCheck` | `POST` brand compliance only |
| `apiMediaSearch` | Search |

## Jobs

| Constant | Queue name |
|----------|------------|
| `ANALYSIS_JOB_NAME` | `videon.media.analysis` |
| `BRAND_COMPLIANCE_JOB_NAME` | `videon.media.brand_compliance` |
| `EXPORT_JOB_NAME` | `videon.cut.export` |
