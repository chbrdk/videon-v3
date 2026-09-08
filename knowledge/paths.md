# Paths & env (VIDEON v3)

Canonical route and env keys live in `apps/web/lib/paths.ts` and resolvers in `apps/web/lib/runtime-config.ts`. Do not hardcode service bases in handlers or UI.

## Product

| Key | Value |
|-----|-------|
| Product id | `videon` |
| Federation contract | `2026-05-plexon-federation-v3` |
| Staging app | `https://videon.projects-a.plygrnd.tech` |
| Staging Brandion | `https://brandion-v3.projects-a.plygrnd.tech` |
| Object storage | `VIDEON_OBJECT_STORAGE_*`; optional `VIDEON_OBJECT_STORAGE_PUBLIC_ENDPOINT` for browser signed URLs; CORS extras via `VIDEON_OBJECT_STORAGE_CORS_ORIGINS`. Direct PUT falls back to `PUT /api/media/:id/upload`. |

## UI / DS

| Key / path | Meaning |
|------------|---------|
| `apps/web/lib/msqdx-ui.ts` | Shared primitives barrel |
| `apps/web/lib/msqdx-ui-shell.ts` | AppFrame / NavRail barrel |
| `apps/web/lib/msqdx-ui-client.ts` | Client overlays barrel |
| `hubIndexLayoutKey` | Session storage for cards/list hub layout |
| `defaultTheme` | `light` → SSR `data-theme=msqdx` via `resolveThemeId` |
| `themeStorageKey` / `localeStorageKey` / `accentStorageKey` | `videon.v3.*` prefs |
| `knowledge/i18n.md` | DE/EN UI dictionaries |
| `specs/domain/settings.md` | SettingsShell + prefs sync |
| `specs/domain/videon-ui-surfaces.md` | Hub + editor IA |
| `knowledge/ui-rebuild-reuse.md` | Keep/reshape import map |
| Docker `MSQDX_UI_REF` | Pinned `chbrdk/msqdx-ui` commit for Coolify sibling fetch |
| Stem worker | Always-on Demucs (`services/stem-worker`, port **8091**); staging UUID `nodc0dxwwwnpjc2uvk0snrff` — see `staging-coolify-stem-worker.md` |
| `VIDEON_STEM_SERVICE_URL` | Base URL of stem worker (no trailing slash); staging `https://nodc0dxwwwnpjc2uvk0snrff.projects-a.plygrnd.tech` |
| MCP | Coolify `videon-mcp` `pjupngbkompeyfjqocgsi0jy` · FQDN `https://pjupngbkompeyfjqocgsi0jy.projects-a.plygrnd.tech` · port **3103**; Plexon `VIDEON_MCP_URL`; specs `mcp-server.md` / `assistant-videon-mcp.md` |
| Platform Assistant FAB | `PlatformAssistantHost` in AppShell → `{NEXT_PUBLIC_PLEXON_URL}/assistant/embed?product=videon`; paths `pathAssistantEmbed` / `pathAssistantExpand`; spec `platform-assistant-host.md` |
| `envPlexonPublicUrl` | `NEXT_PUBLIC_PLEXON_URL` (browser iframe origin; fallback `NEXT_PLEXON_BASE_URL` / `PLEXON_AUTH_URL`) |
| Media frame (assistant poster) | `GET /api/media/:id/frame?platformProjectId=&t=` → `image/jpeg`; cache key `(workspaceId, mediaAssetId, tMs, maxWidth)`; spec `specs/api/media-frame.md` |
| Media preview (assistant hover) | `GET /api/media/:id/preview?platformProjectId=&t=&durationMs=` → `video/mp4` ≤3s; spec `specs/api/media-preview.md` |
| Scene hit model | `specs/domain/scene-hit-model.md` — shared Product `/chat` + Plexon `video_hit_strip` |
| Knowledge facet `media_insights` | Publish via Plexon Collection Knowledge Pack; ownership VIDEON · `specs/domain/media-insights-publish.md` · `apps/web/lib/plexon-knowledge-pack.ts` |

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

## Media API

| Route helper | HTTP |
|--------------|------|
| `GET /api/media` | Mediathek across accessible projects (`scope: accessible`) |
| `GET /api/media?platformProjectId=` | Project-scoped list |
| `apiMediaDetail` | `GET`/`DELETE` media (project-scoped) |
| `apiMediaPlayback` / `apiMediaStream` | Playback (project-scoped) |
| `apiMediaFrame` | `GET /api/media/:id/frame?platformProjectId=&t=` → JPEG poster |
| `apiMediaPreview` | `GET /api/media/:id/preview?platformProjectId=&t=&durationMs=` → muted MP4 ≤3s |
| `apiMediaStemStream(id, voice\|music, projectId, { download? })` | Stem WAV stream; `download: true` → attachment (`?download=1`) |
| `apiMediaAnalysis` | `POST` full analysis re-run |
| `apiMediaBrandCheck` | `POST` brand compliance only |
| `apiMediaSearch` | Search (project-scoped) |

UI routes: `/chat` scene search (Card grid + deep-link `?t=`/`?scene=`); `/projects` Projekte hub; `/library` global Mediathek; `/collections` → `/projects`.

| Route helper | Meaning |
|--------------|---------|
| `mediaFor(id, projectId)` | `/media/:id?platformProjectId=` |
| `mediaFor(id, projectId, { tMs, sceneKey })` | same + optional `t` (ms) and `scene` for editor seek |

`GET /api/media/search?q=` — accessible scene search (optional `platformProjectId` scopes to one project).

Writes, detail, stream, upload remain auth + `platformProjectId`.

## Jobs

| Constant | Queue name |
|----------|------------|
| `ANALYSIS_JOB_NAME` | `videon.media.analysis` |
| `BRAND_COMPLIANCE_JOB_NAME` | `videon.media.brand_compliance` |
| `EXPORT_JOB_NAME` | `videon.cut.export` |
| `REFRAME_JOB_NAME` | `videon.media.reframe` |
| `VIDEON_REFRAME_SERVICE_URL` | Always-on reframe worker base (no trailing slash) |
| Media reframe API | `POST/GET /api/media/:id/reframe(s)` — `specs/api/media-reframe.md` |
| Reframe worker | Coolify `videon-v3:reframe-worker` `hydwudxhs3ovqdf3lpdk9gjz` · port **8092** · FQDN `https://hydwudxhs3ovqdf3lpdk9gjz.projects-a.plygrnd.tech` · `knowledge/staging-coolify-reframe-worker.md` |
| Multi-source Cuts | `specs/domain/cut-multi-source-compose.md` · `specs/api/cuts.md` — `PATCH addScenes`; MCP `videon.cut_scenes_add` |
| Cut export extras | `specs/domain/cut-export-extras.md` — canvas presets + `premiere_xml` |

## V7 production rollout

| Doc | Role |
|-----|------|
| `specs/domain/v7-production-rollout.md` | Domain acceptance / EARS |
| `knowledge/v7-production-runbook.md` | Operator SoT (deploy, canary, rollback, retention) |
| `knowledge/legacy-migration-opt-in.md` | Mapping report `videon.legacy-migration.v1` |
| `knowledge/v7-staging-exercise-log.md` | Exercise evidence (E1–E6) |
| Coolify main-app | `mi0j3pyjrel80jodebwvhgvi` |
| Coolify MCP | `pjupngbkompeyfjqocgsi0jy` |
| Coolify stem-worker | `nodc0dxwwwnpjc2uvk0snrff` |
| Coolify Postgres | `qvh3hghdbjggzs8bysk9qrqc` |
| Legacy v2 app (freeze) | `q8c8gwwck404k04okkkwskgk` |
| Staging exercise runner | `node scripts/v7-staging-exercises.mjs` |
