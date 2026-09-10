# Adobe UXP Library Panel (Premiere + After Effects)

**Status:** Accepted — 2026-09-10 (Wave 0 API + Premiere Wave 1 scaffold)  
**Product:** VIDEON v3  
**Federation:** `2026-05-plexon-federation-v3`  
**Companions:** `scene-hit-model.md` · `scene-chat.md` · `settings-api-tokens.md` · `mcp-server.md` · `specs/api/media-adobe-download.md` · PLEXON `specs/domain/videon-integration.md` · Legacy reference `videon/tools/ae-uxp-plugin`  
**Knowledge:** `knowledge/paths.md`  
**Implements (scaffold):** `tools/adobe-uxp-library-panel/` · `GET /api/media/:id/adobe-download`

## Purpose

Give editors a **native Adobe panel** that searches the Collection-scoped VIDEON library and inserts matching **scene ranges** into Premiere Pro (Wave 1) or After Effects (Wave 1.5) without leaving the NLE.

This is a **product client** of the VIDEON Product API — not a second library, not an MCP agent surface, and not a port of the legacy localhost PrismVid backend.

## Problem

Operators already analyze and index footage in VIDEON, but reuse still happens by scrubbing folders or exporting once. Search must land where cutting happens: Premiere timeline / AE composition.

## Non-goals

- CEP panels (legacy only; no new CEP work).
- Final Cut / DaVinci native panels (use Cut export / Premiere ZIP instead — `cut-export-extras.md`).
- Upload, analysis enqueue, brand check, or Cut authoring from the panel (Wave 1 read + insert only).
- Embedding video bytes, full transcripts, or long-lived signed URLs in search payloads (same discipline as MCP).
- Collection-less or cross-tenant search.
- Hardcoded service bases, model IDs, or storage paths in the panel.

## Host strategy

| Host | Wave | Insert target |
|------|------|----------------|
| **Premiere Pro** | **1 (MVP)** | Project Bin + optional active Sequence with In/Out from `startMs`/`endMs` |
| **After Effects** | **1.5** | Footage import + Comp layer trimmed to scene range (port Legacy `ae.ts` patterns) |
| FCP / Resolve | Later | Export bridge only — no UXP panel in this program |

**Architecture:** one **shared panel core** (auth, Collection pick, search UI, hit model, download/cache) + thin **host adapters** (Premiere vs AE scripting). Do not fork two product plugins.

## Auth & tenancy

### Wave 1 (locked)

1. Operator creates a personal Settings API token in VIDEON (`videon_…`) — `settings-api-tokens.md`.
2. Panel stores token in the Adobe secure preferences store for that host (never in project files, never in git, never logged).
3. All Product calls use `Authorization: Bearer <token>`. Token owner = Access Model B principal.
4. `platformProjectId` is **required for insert** and for media stream/download. Search MAY omit it to query accessible Collections (same semantics as `GET /api/media/search`).
5. Panel MUST list Collections via `GET /api/collections` (or equivalent accessible directory) and let the operator pin a default Collection.

### Wave 2 (optional)

Device-code / browser SSO against PLEXON, then short-lived Product session or exchanged token — only if Settings tokens prove insufficient for customer rollout. Session-cookie forwarding from the NLE is out of scope.

### Forbidden

- Shipping a shared team token in the `.ccx` package.
- Using `PLEXON_SERVICE_SECRET` from the panel (assistant/MCP path only).
- Accepting a client-supplied allowlist of project ids for search.

## Product API contract (panel)

Reuse existing Product routes; extend only where noted.

| Action | Route | Notes |
|--------|-------|--------|
| Health | `GET /api/health` | Panel settings / connectivity |
| Collections | `GET /api/collections` | Picker; Model B |
| Search | `GET /api/media/search?q=&platformProjectId?&limit?` | Same query plan as `/chat` (`scene-search-query`) |
| Hit posters | `GET /api/media/:id/frame?platformProjectId=&t=&w=` | Prefer `w=240` or `160` |
| Hover/scrub preview (optional) | `GET /api/media/:id/preview?…` | ≤3s; not required for MVP insert |
| Media for insert | `GET /api/media/:id/adobe-download` (`media-adobe-download.md`) | Issued **after** user selects insert — never in search list |

### Search hit shape

Hits MUST map through `scene-hit-model.md` fields:

`id`, `mediaAssetId`, `platformProjectId`, `sceneKey`, `mediaFilename`, `startMs`, `endMs`, `searchText` (≤ 200 in agent-like UIs; panel MAY show slightly longer locally), `projectName`, relative `href`.

Panel UI MAY additionally show a local poster URL built from the frame route with Bearer — still no signed object URL in the search JSON.

Hard limit Wave 1: ≤ **40** hits returned to the panel UI. Product `GET /api/media/search` MUST accept `limit` and clamp to **1…40** (default 20).

## Media delivery (insert)

1. WHEN the operator inserts THEN the panel MUST call `GET /api/media/:mediaAssetId/adobe-download` with `platformProjectId`, `kind`, and `mode=json` under the authenticated principal.
2. Wave 1 MUST use `kind=source`. `kind=proxy` is reserved and MUST return `409` `proxy_unavailable` until edit proxies exist — no silent fallback.
3. The panel MUST persist bytes using `cacheKey` from the JSON response (`{mediaAssetId}:{kind}:{checksumSha256}`) under the local Adobe/VIDEON cache path (UXP data folder).
4. Re-insert of the same asset MUST reuse local cache when the indexed file still exists on disk; stale index rows MUST be dropped.
5. The cache MUST enforce soft caps (default ≤ 5 GiB and ≤ 80 media entries) via oldest-first eviction before adding new media.
6. Settings MUST show cache stats and offer clear + refresh (existence check).
7. Poster frames MAY be cached separately under `{mediaAssetId}:poster:w{w}:t{t}` and reused on subsequent searches.
8. WHEN download fails or auth expires THEN insert MUST fail closed with a clear panel error — no silent fallback to another Collection’s file.
9. Search / MCP payloads MUST NOT embed `downloadUrl` or other signed object URLs.

## Insert semantics

### Shared

1. Timing source of truth is **milliseconds** (`startMs` / `endMs`) from the hit; host adapter converts to frames using the **footage** frame rate (not only sequence/comp FPS).
2. WHEN `endMs` ≤ `startMs` or timing is missing THEN insert MUST import the full media (or refuse with explicit reason) — MUST NOT invent scene bounds.
3. Multi-select: insert in list order; optional gap frames/seconds between clips (Legacy sequential placement).
4. Panel MUST keep a deep link action (“In VIDEON öffnen”) using Product `href` + configured `VIDEON` public base from settings.

### Premiere (Wave 1)

1. Requires Premiere Pro **UXP ≥ 25.6** (`premierepro` module).
2. Import into a dedicated Bin via `importFiles(paths, suppressUI=true, targetBin|null, false)` — never pass `undefined` as `targetBin`.
3. Resolve the imported `ClipProjectItem` by media path / name; set scene bounds with `createSetInOutPointsAction` when `startMs`/`endMs` are valid.
4. Optional: append to the active Sequence with `SequenceEditor.createInsertProjectItemAction` at playhead (V1/A1). Bin-only remains acceptable if Sequence insert fails.
5. Markers optional (sceneKey / search snippet) — nice-to-have, not MVP-blocking.
6. Import MUST use a **local filesystem path** from the panel cache — signed HTTPS URLs are invalid for `importFiles`.

### After Effects (Wave 1.5)

1. Panel MUST detect host (`PPRO` vs `AEFT`) and route insert to the AE adapter when running in After Effects.
2. Manifest MUST declare both Premiere and After Effects hosts (dual-host package).
3. Import footage from the **local cache path** (same `adobe-download` + cache as Premiere); never use search `downloadUrl` or legacy localhost `videoFilePath`.
4. Place a layer in the target Comp (existing by name or create); trim to scene `startMs`/`endMs` using footage FPS for source timing; support sequential placement + gap frames (Legacy port, corrected layer math).
5. WHERE Adobe has not yet shipped public AE UXP DOM APIs THEN the adapter MUST: (a) try ExtendScript-style `app.project` when available in-host; (b) otherwise return a structured placement plan + clear `mode: 'plan'` / `unsupported` message — MUST NOT pretend success without an insert.
6. Panel UX on AE: Comp name + sequential + gap controls (not Premiere Bin/Sequence checkboxes).

## Panel UX (Wave 1)

Minimum surface:

1. Settings: Product base URL (from env/docs, no hardcode in source defaults beyond staging documented in `knowledge/paths.md`), API token, default Collection, default Bin/Comp name, cache path reveal/clear.
2. Search field + Enter; loading and empty states.
3. Result list: poster, filename, project, scene/timing, snippet, score/rank if present; multi-select.
4. Insert options: Bin only vs Bin+Sequence (Premiere); target Comp (AE); sequential + gap.
5. Progress for multi-insert downloads.

UI may be plain UXP HTML/CSS in Wave 1. Do **not** bundle `@msqdx/ui` into Adobe unless a later wave explicitly adopts a build that supports it — keep the panel thin.

## Packaging & distribution

| Artifact | Notes |
|----------|--------|
| UXP `manifest.json` | Host ids for Premiere (Wave 1) and AE (Wave 1.5) |
| `.ccx` | Internal sideload via UXP Developer Tool / private distribution |
| Install guide | Operator steps + token creation in VIDEON Settings |

No Coolify deploy of the panel binary; Product API remains the server side.

## Legacy keep / drop

| Legacy (`videon/tools/ae-uxp-*`) | v3 |
|----------------------------------|-----|
| Search → multi-select → insert UX | **Keep** pattern |
| Timecode trim / sequential / gap | **Keep** (port) |
| UXP panel shape | **Keep** |
| `localhost:4001` + optional loose token | **Drop** → Settings Bearer + Model B |
| `videoFilePath` on search hits | **Drop** → authenticated download/cache |
| CEP plugin tree | **Drop** for new work |
| PrismVid naming | **Drop** → VIDEON |

## Env / paths (panel + docs)

Document canonical values only in `knowledge/paths.md`. Panel settings keys (illustrative):

| Key | Meaning |
|-----|---------|
| `videon.adobe.productBaseUrl` | VIDEON origin (no trailing slash) |
| `videon.adobe.apiToken` | Settings token (secure store) |
| `videon.adobe.defaultPlatformProjectId` | Pinned Collection |
| `videon.adobe.cacheDir` | Local media cache |

Product routes remain those in `apps/web/lib/paths.ts` (`apiMediaSearch`, `apiMediaFrame`, playback/stream, collections).

## Waves & acceptance

### Wave 0 — Spec / API readiness

1. This domain spec + `specs/api/media-adobe-download.md` accepted.
2. `paths.routes.apiMediaAdobeDownload` + `GET /api/media/:id/adobe-download` exist; Bearer Settings token works under Model B.
3. `kind=proxy` returns `409` `proxy_unavailable` until proxies ship.

**Wave 0 ship:** Product route + path helper + contracts `proxy_unavailable` + search `limit` 1…40 + panel scaffold under `tools/adobe-uxp-library-panel/`.

### Wave 1 — Premiere MVP

1. Operator pastes Settings token, picks Collection, searches, sees hits with posters.
2. Insert one scene into Bin with correct media identity (`kind=source` download + cache).
3. Sequence append is best-effort / host-API gated — Bin-only is an acceptable first customer build if Sequence APIs are unstable.
4. Second insert of same asset reuses `cacheKey` only when the file still exists; otherwise re-download.
5. Cache clear removes indexed media + posters; refresh drops stale index rows.
6. Wrong/expired token → clear 401; no access to foreign Collections.
7. Manual QA guide in `tools/adobe-uxp-library-panel/README.md`.

### Wave 1.5 — After Effects

1. Same search/auth/cache core; dual-host manifest (`PPRO` + `AEFT`).
2. AE adapter: placement planner unit-tested; ExtendScript `app.project` insert when available; otherwise explicit plan/`unsupported` (public AE UXP DOM still pending Adobe).
3. Panel switches Comp / sequential / gap UI when host is After Effects.
4. Legacy CEP not required for install.

### Wave 2 — Hardening

1. `kind=proxy` when edit proxies exist; UI labels quality used.
2. Device-code auth (if needed).
3. Automated unit tests for time conversion + API client; host integration tests mocked.

## Capability alignment

| Catalog / surface | Relation |
|-------------------|----------|
| `videon.media.search` | Same Product search the panel calls; MCP remains agent-only and MUST NOT return signed download URLs |
| In-app `/chat` | Same retrieval semantics; different chrome |
| Cut `premiere_xml` export | Complementary (project handoff); panel is live search/insert |

## Open questions (resolve before Wave 1 code freeze)

1. Does Premiere UXP in target Adobe versions support reliable Sequence insert APIs we need, or is Bin-only MVP acceptable for first customer build? → **Bin-only is acceptable**; Sequence remains optional checkbox.
2. Is an edit proxy always available after analysis, or must Wave 1 insert source for all assets? → **Wave 1 = source only** (`kind=proxy` → `409`).
3. Customer distribution: private `.ccx` only vs Adobe Exchange later (out of Wave 1).
