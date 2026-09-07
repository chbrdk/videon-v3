# Paths & env (VIDEON v3)

Canonical route and env keys live in `apps/web/lib/paths.ts` and resolvers in `apps/web/lib/runtime-config.ts`. Do not hardcode service bases in handlers or UI.

## Product

| Key | Value |
|-----|-------|
| Product id | `videon` |
| Federation contract | `2026-05-plexon-federation-v3` |
| Staging app | `https://videon.projects-a.plygrnd.tech` |
| Staging Brandion | `https://brandion-v3.projects-a.plygrnd.tech` |

## UI / DS

| Key / path | Meaning |
|------------|---------|
| `apps/web/lib/msqdx-ui.ts` | Shared primitives barrel |
| `apps/web/lib/msqdx-ui-shell.ts` | AppFrame / NavRail barrel |
| `apps/web/lib/msqdx-ui-client.ts` | Client overlays barrel |
| `hubIndexLayoutKey` | Session storage for cards/list hub layout |
| `specs/domain/videon-ui-surfaces.md` | Hub + editor IA |
| `knowledge/ui-rebuild-reuse.md` | Keep/reshape import map |
| Docker `MSQDX_UI_REF` | Pinned `chbrdk/msqdx-ui` commit for Coolify sibling fetch |
| Stem worker | Always-on Demucs (`services/stem-worker`, port **8091**); staging UUID `nodc0dxwwwnpjc2uvk0snrff` — see `staging-coolify-stem-worker.md` |
| `VIDEON_STEM_SERVICE_URL` | Base URL of stem worker (no trailing slash); staging private `http://nodc0dxwwwnpjc2uvk0snrff:8091` |

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
| `apiMediaStemStream(id, voice\|music, projectId)` | Stem WAV stream after split |
| `apiMediaAnalysis` | `POST` full analysis re-run |
| `apiMediaBrandCheck` | `POST` brand compliance only |
| `apiMediaSearch` | Search |

## Jobs

| Constant | Queue name |
|----------|------------|
| `ANALYSIS_JOB_NAME` | `videon.media.analysis` |
| `BRAND_COMPLIANCE_JOB_NAME` | `videon.media.brand_compliance` |
| `EXPORT_JOB_NAME` | `videon.cut.export` |
