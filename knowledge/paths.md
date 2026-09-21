# Paths & env (VIDEON v3)

Canonical route and env keys live in `apps/web/lib/paths.ts` and resolvers in `apps/web/lib/runtime-config.ts`. Do not hardcode service bases in handlers or UI.

## Product

| Key | Value |
|-----|-------|
| Product id | `videon` |
| Federation contract | `2026-05-plexon-federation-v3` |
| Staging app | `https://videon.projects-a.plygrnd.tech` |
| Staging Brandion | `https://brandion-v3.projects-a.plygrnd.tech` |
| Object storage | `VIDEON_OBJECT_STORAGE_*`; optional `VIDEON_OBJECT_STORAGE_PUBLIC_ENDPOINT` for browser signed URLs. MinIO community has **no bucket CORS** → upload uses same-origin **multipart chunks** (`PUT /api/media/:id/upload-part`). |

## UI / DS

| Key / path | Meaning |
|------------|---------|
| `apps/web/lib/msqdx-ui.ts` | Shared primitives barrel |
| `apps/web/lib/msqdx-ui-shell.ts` | AppFrame barrel (product chrome = top-nav pill; NavRail unused) |
| `apps/web/components/topbar-trail-host.tsx` | CREATION-style trail host for Cut/Media editor tools in `AppFrame.topbar` |
| `apps/web/lib/msqdx-ui-client.ts` | Client overlays barrel |
| `hubIndexLayoutKey` | Session storage for cards/list hub layout |
| `videon.cut.lockedClipIds.<cutId>` | localStorage JSON string[] of UI-locked clip ids (Wave 3) |
| Cut edit Wave 4 | `specs/domain/cut-timeline-edit-ux-wave4.md` — Slip commit + multilayer undo |
| Cut edit Wave 5 | `specs/domain/cut-timeline-edit-ux-wave5.md` — Ripple Resize trim |
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
| Media frame (assistant + Cut editor posters) | `GET /api/media/:id/frame?platformProjectId=&t=&w=` → `image/jpeg`; tiers `160`/`240`/`480`; eager S3 posters + write-through; cache `private, max-age=86400`; specs `specs/api/media-frame.md`, `specs/domain/cut-editor-load-performance.md` |
| Media peaks backfill | `POST /api/media/:id/peaks-backfill?platformProjectId=` → mixPeaks without full re-analysis; `specs/api/media-peaks-backfill.md` |
| Media preview (assistant hover + Adobe panel cards) | `GET /api/media/:id/preview?platformProjectId=&t=&durationMs=` → `video/mp4` ≤3s; spec `specs/api/media-preview.md` |
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
| `apiMediaFrame` | `GET /api/media/:id/frame?platformProjectId=&t=&w=` → JPEG poster |
| `apiMediaPeaksBackfill` | `POST /api/media/:id/peaks-backfill?platformProjectId=` → mixPeaks backfill |
| `apiMediaPreview` | `GET /api/media/:id/preview?platformProjectId=&t=&durationMs=` → muted MP4 ≤3s |
| `apiMediaStemStream(id, voice\|music, projectId, { download? })` | Stem WAV stream; `download: true` → attachment (`?download=1`) |
| `apiMediaAnalysis` | `POST` full analysis re-run |
| `apiMediaBrandCheck` | `POST` brand compliance only |
| `apiMediaSearch` | Search (project-scoped) |
| `apiMediaAdobeDownload` | `GET /api/media/:id/adobe-download?platformProjectId=&kind=&mode=` — Adobe panel insert (`specs/api/media-adobe-download.md`) |

UI routes: `/chat` scene search (Card grid + deep-link `?t=`/`?scene=`); `/projects` Projekte hub; `/library` global Mediathek; `/collections` → `/projects`.

| Route helper | Meaning |
|--------------|---------|
| `mediaFor(id, projectId)` | `/media/:id?platformProjectId=` |
| `mediaFor(id, projectId, { tMs, sceneKey })` | same + optional `t` (ms) and `scene` for editor seek |

`GET /api/media/search?q=` — accessible scene search (optional `platformProjectId` scopes to one project; optional `limit` clamped 1…40, default 20).

Writes, detail, stream, upload remain auth + `platformProjectId`.

## Collection team (PLEXON SSOT)

VIDEON has no `/projects/:id` page — the team is a thin aside on the Projekte hub, bound to the
active `platformProjectId`. PLEXON owns the roster; `videon_workspace_members` stays a read
projection written only by the provisioning replay in `apps/web/lib/db/workspaces.ts`.

| Key | Value |
|-----|-------|
| `apiCollectionMembers(projectId)` | `GET`/`POST /api/collections/:platformProjectId/members` |
| `apiCollectionMember(projectId, userId)` | `DELETE /api/collections/:platformProjectId/members/:userId` |
| `apiCollectionInvites(projectId)` | `POST /api/collections/:platformProjectId/invites` |
| `plexonProvisioningCollectionMembersPath(id)` | `/api/platform/provisioning/collections/:id/members` |
| `plexonProvisioningCollectionMemberPath(id, userId)` | `/api/platform/provisioning/collections/:id/members/:userId` |
| `plexonProvisioningCollectionInvitesPath(id)` | `/api/platform/provisioning/collections/:id/invites` |
| `apps/web/lib/collection-members-plexon.ts` | Federation client (contract headers + `X-Plexon-User-Id`) |
| `apps/web/lib/collection-team-access.ts` | Gate via `accessible-collections`; no local workspace writes |
| `apps/web/lib/plexon-platform-id.ts` | `isRealPlatformProjectId` UUID guard |
| `apps/web/components/collection-team-panel.tsx` | Compact panel (inline draft row + invite link) |
| Locale keys | `collections.team.*` in `apps/web/locales/{en,de}.json` |

Spec: [`specs/domain/project-team.md`](../specs/domain/project-team.md).

Outbound team/auth mail is **Plexon-only** (no Videon `SMTP_*`). Login deep-links to Plexon `/forgot-password` via `lib/plexon-links.ts` + `NEXT_PUBLIC_PLEXON_URL`. See `plexon-v3/specs/domain/transactional-email.md`.

## Adobe UXP Library Panel

| Key / path | Meaning |
|------------|---------|
| Domain spec | `specs/domain/adobe-uxp-library-panel.md` — Premiere Wave 1, AE Wave 1.5 |
| Open Cut wave | `specs/domain/adobe-uxp-open-cut-premiere.md` — Cut → Premiere sequence via `premiere_xml` ZIP |
| Package | `tools/adobe-uxp-library-panel/` (UXP dual-host: Premiere Wave 1 + AE Wave 1.5) |
| UDT External copy (macOS) | `~/Library/Application Support/Adobe/UXP/Plugins/External/videon.libraryPanel_<version>/` — frozen after Load; must Unload + Load / re-sync after every build |
| Panel version chrome | Header shows `vX.Y.Z` from `PANEL_VERSION` in `src/index.js` (must match `manifest.json`); current **0.1.49** |
| Preview playback notes | `knowledge/adobe-uxp-panel-preview-playback.md` |
| Auth | Settings API Bearer (`settings-api-tokens.md`); owner via `POST /api/tokens/verify`; table `api_tokens` |
| Search | Same `GET /api/media/search` + `scene-hit-model.md` as `/chat` |
| Posters | `GET /api/media/:id/frame` (`apiMediaFrame`) |
| Card MP4 previews | `GET /api/media/:id/preview` → write into UXP data folder → `<video src>` via `plugin-data:` / `getFsUrl` / `file:/nativePath` (opacity reveal; blob: unreliable) — see `knowledge/adobe-uxp-panel-preview-playback.md` |
| Insert media | `GET /api/media/:id/adobe-download` — `specs/api/media-adobe-download.md`; helper `paths.routes.apiMediaAdobeDownload` |
| Legacy reference | `videon/tools/ae-uxp-plugin` (PrismVid; localhost path — do not reuse) |
| Panel prefs (illustrative) | `videon.adobe.productBaseUrl` · `videon.adobe.apiToken` · `videon.adobe.defaultPlatformProjectId` · `videon.adobe.cacheDir` |

## Jobs

| Constant | Queue name |
|----------|------------|
| `ANALYSIS_JOB_NAME` | `videon.media.analysis` |
| `BRAND_COMPLIANCE_JOB_NAME` | `videon.media.brand_compliance` |
| `EXPORT_JOB_NAME` | `videon.cut.export` |
| `REFRAME_JOB_NAME` | `videon.media.reframe` |
| `GENERATE_JOB_NAME` | `videon.media.generate` |
| `VIDEON_REFRAME_SERVICE_URL` | Always-on reframe worker base (no trailing slash) |
| Media reframe API | `POST/GET /api/media/:id/reframe(s)` — `specs/api/media-reframe.md` |
| AI generative edit | `POST/GET /api/media/:id/generate` — OpenRouter Video API · `specs/domain/media-generative-edit.md` · `specs/api/media-generative-edit.md` · `knowledge/ai-clip-generation.md` |
| Cut AI generate jobs | `GET /api/cuts/:cutId/generate-jobs` — jobs with `target_cut_id` |
| AI generative create | `POST/GET /api/media/ai-create` — T2V/I2V create jobs |
| `OPENROUTER_API_KEY` | Shared vision + **video generation** gateway |
| `VIDEON_GENERATION_MAX_EDIT_MS` | Max edit range ms (default `12000`) |
| `VIDEON_GENERATION_MAX_CONCURRENT` | Max concurrent generate jobs per workspace (default `2`) |
| `VIDEON_GENERATION_SEEDANCE_MODEL` | Optional OpenRouter slug (default `bytedance/seedance-2.5`) |
| `VIDEON_GENERATION_SEEDANCE_MINI_MODEL` | Optional cheap edit/draft (default `bytedance/seedance-2.0-mini`) |
| `VIDEON_GENERATION_DRAFT_MODEL` | Optional; defaults to Seedance Mini |
| `VIDEON_GENERATION_VEO_MODEL` | Optional (default `google/veo-3.1`) |
| `VIDEON_GENERATION_VEO_LITE_MODEL` | Optional (default `google/veo-3.1-lite`) |
| `VIDEON_GENERATION_WAN_MODEL` | Optional (default `alibaba/wan-3.0`) |
| `VIDEON_GENERATION_MINIMAX_MODEL` | Optional create (default `minimax/hailuo-3-max`) |
| `VIDEON_GENERATION_MINIMAX_EDIT_MODEL` | Optional edit (default `minimax/hailuo-3`) |
| `VIDEON_GENERATION_ALEPH_MODEL` | Optional; when set enables `runway_aleph_2` |
| Coolify generation | OpenRouter on main-app — `knowledge/staging-coolify-fal-generation.md` |
| Reframe worker | Coolify `videon-v3:reframe-worker` `hydwudxhs3ovqdf3lpdk9gjz` · port **8092** · FQDN `https://hydwudxhs3ovqdf3lpdk9gjz.projects-a.plygrnd.tech` · `knowledge/staging-coolify-reframe-worker.md` |
| Multi-source Cuts | `specs/domain/cut-multi-source-compose.md` · `specs/api/cuts.md` — `PATCH addScenes`; MCP `videon.cut_scenes_add` |
| Cut export extras | `specs/domain/cut-export-extras.md` — canvas presets + Premiere ZIP (`premiere_xml`) |
| Open Cut in Premiere (panel wave) | `specs/domain/adobe-uxp-open-cut-premiere.md` · `knowledge/adobe-uxp-open-cut-premiere.md` |
| Cut pushback from Premiere (sketch) | `specs/domain/adobe-uxp-cut-pushback-premiere.md` · `knowledge/adobe-uxp-cut-pushback-premiere.md` — **manual parity** both directions; not live sync |
| Pushback → dead playback | `knowledge/adobe-uxp-pushback-restore-playback.md` — duplicate filename / ticks / peaks |
| Pushback effects Wave P3 | `knowledge/adobe-uxp-pushback-effects-backlog.md` — clip `<filter>` sidecar (no Videon UI) |
| Provider-first (clips/scenes) | `knowledge/adobe-uxp-provider-first.md` — Cuts tab + in-place sync off (`panel-features.js`) |
| Scenes provider polish | `knowledge/adobe-uxp-scenes-provider-polish.md` — insert In/Out + cards ≥ 0.1.37 |
| Hit detail overlay | `knowledge/adobe-uxp-hit-detail-overlay.md` — Anzeigen → width-scaled MP4 preview + rich meta ≥ 0.1.49 |
| Panel MSQ DX chrome | `knowledge/adobe-uxp-panel-msqdx-ui.md` — brand-lockup + `ds-*` via `styles.bundle.css` ≥ 0.1.48; controls are `div[role=button]` |
| In-place Premiere patch Wave P4 | `knowledge/adobe-uxp-inplace-patch-premiere.md` — **paused** ≥ 0.1.35 |
| Cut change watch Wave P5 | `knowledge/adobe-uxp-cut-change-watch.md` — **paused** ≥ 0.1.35 |
| Cut multi-track | `specs/domain/cut-multi-track.md` — extra `audio_bus` / Voice-Over spur |

## V7 production rollout

| Doc | Role |
|-----|------|
| `specs/domain/v7-production-rollout.md` | Domain acceptance / EARS |
| `knowledge/v7-production-runbook.md` | Operator SoT (deploy, canary, rollback, retention) |
| `knowledge/legacy-migration-opt-in.md` | Mapping report `videon.legacy-migration.v1` |
| `knowledge/media-storage-key-corrupt.md` | Corrupt `storage_key` (e.g. `workspaceId/` only) → export heal + re-upload |
| `knowledge/v7-staging-exercise-log.md` | Exercise evidence (E1–E6) |
| Coolify main-app | `mi0j3pyjrel80jodebwvhgvi` |
| Coolify MCP | `pjupngbkompeyfjqocgsi0jy` |
| Coolify stem-worker | `nodc0dxwwwnpjc2uvk0snrff` |
| Coolify Postgres | `qvh3hghdbjggzs8bysk9qrqc` |
| Legacy v2 app (freeze) | `q8c8gwwck404k04okkkwskgk` |
| Staging exercise runner | `node scripts/v7-staging-exercises.mjs` |
