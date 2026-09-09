# Cut editor load performance

**Status:** Active — Wave 4 (eager S3 posters + direct img cache + mixPeaks backfill)  
**Product:** VIDEON v3  
**Implements:** Progressive Cut open · Eager poster frames in object storage · Direct browser-cached Frame URLs · Width tiers · mixPeaks backfill · Monitor poster-first  
**API companions:** `specs/api/media-frame.md` · `specs/api/media-preview.md` · `specs/api/cuts.md` · `specs/api/media-list.md`  
**UI companions:** `specs/domain/videon-ui-surfaces.md` · `specs/domain/cut-multi-source-compose.md` · `knowledge/paths.md`  
**Federation:** `2026-05-plexon-federation-v3`

## Purpose

Make `/cuts/:id` feel **interactive quickly**: shell (top chrome, monitor frame, timeline dock, rails) must appear before expensive media work finishes. Poster frames, waveforms, and library thumbnails MUST load progressively — NOT by decoding the full media stream once per surface on open.

## Problem (current)

Opening a Cut with one ready video typically:

1. Fetches Cut detail ∥ media list.
2. Resolves playback URL (often twice — prefetch + active clip).
3. Starts **multiple** full/partial stream loads in parallel: program monitor, client waveform decode, timeline clip thumb capture, Bin card thumb captures.
4. Uses `useClipThumbnail` (hidden `<video>` + canvas seek) instead of the existing server Frame API (`GET /api/media/:id/frame`).

Result: long blank/partial editor and high decoder contention, especially with a populated Collection library.

## Goals

| Metric (operator feel) | Target |
|------------------------|--------|
| First interactive chrome (nav + monitor shell + timeline dock) | Immediately after Cut JSON; no wait for thumbs/peaks |
| Program video ready-to-play (first clip) | Single playback URL resolution; no duplicate auth/playback fetch |
| Bin / timeline posters | Server JPEG via Frame API; lazy / visible-only |
| Original A1 waveform | Deferred until idle or lane visible; prefer stored peaks when available |

## Non-goals (this sprint)

- Changing Cut/timeline edit math or export pipelines.
- Replacing object storage / CDN architecture.
- Prefetching every Collection media stream into the browser.
- New DS primitives solely for skeletons (app-local placeholders OK; promote later if reused).

## Keep / drop

| Current | Decision |
|---------|----------|
| `useClipThumbnail` as default for Bin + Timeline posters | **Drop as default** — Frame API first; client capture only as explicit fallback when frame route fails closed |
| Immediate Bin thumbs for all library cards on open | **Drop** — IntersectionObserver / visible viewport + concurrency cap |
| Prefetch waveform via full `decodeAudioData` on every playback URL | **Reshape** — defer; reuse stem peaks already on Cut detail; store/serve original peaks when feasible |
| Separate `apiMediaPlayback` then stream URL for posters | **Drop for posters** — posters use `apiMediaFrame`; playback keeps stream route |
| Duplicate playback fetch (prefetch race + `loadPlayback`) | **Fix** — in-flight Promise map / shared resolver |
| Blocking editor shell on thumbs/peaks | **Drop** — skeleton / empty poster slots |

## Architecture

```
Open /cuts/:id
  ├─ GET cut detail          → clips, stem peaks, canvas …
  ├─ GET media list          → Bin cards (meta + sceneCount; no thumbs yet)
  ├─ Resolve playback URL ×1 → program <video> (active clip only first)
  ├─ Frame posters (lazy)    → GET /api/media/:id/frame?t=… (Bin visible + timeline visible)
  └─ Waveform (deferred)     → idle / visible A1 lane; prefer server peaks
```

### Poster source of truth

1. **Primary:** `paths.routes.apiMediaFrame(mediaAssetId, platformProjectId, tMs, width?)` → `image/jpeg` (`specs/api/media-frame.md`).
2. **Bin video card:** `t` ≈ mid duration (or `1000` when duration unknown); width tier **160**.
3. **Bin / timeline scene card:** `t` = scene `startMs` (clamped); timeline width tier **240**.
4. **Evidence / assistant:** width tier **480** (default).
5. **Eager assets (Wave 4):** During analysis (after probe / scene detect), the runner MUST extract and store JPEG posters in object storage under `…/posters/w{width}/t{bucketedMs}.jpg` for mid-point + scene starts (and default `t=1000` at 480). The Frame route MUST prefer these objects before downloading the source for ffmpeg.
6. **Write-through:** WHEN the Frame route extracts on a miss THEN it SHOULD upload the JPEG to the poster key for subsequent hits.
7. **Client cache:** Editors MUST use the Frame URL directly (`<img>` / CSS `background-image`) so the browser HTTP cache applies — NOT `fetch`→blob Object URLs as the default path.
8. **Fallback:** only if frame returns retryable failure after shell is up — optional client capture, concurrency ≤ 2, never blocks open.
9. Frame route auth remains Access Model B; editor MUST pass `platformProjectId`.

### Playback

1. Prefer building the relative stream URL via `mediaStreamPlaybackUrl` when the session already proved Model B access for the Cut workspace (Cut detail success implies access) — OR keep `apiMediaPlayback` but **dedupe** concurrent callers with an in-flight map keyed by `mediaAssetId`.
2. Prefetch playback URLs for **non-active** timeline media MUST be idle-deferred (requestIdleCallback / after first paint), not competing with the active monitor.
3. Module/session caches for URL strings and frame blobs MAY persist for the tab lifetime; they MUST NOT bypass Model B on subsequent navigations to another Collection.
4. **Wave 4:** Program monitor MUST show a Frame poster for the active clip and keep `preload="none"` until the operator starts playback (then MAY raise preload).

### Waveform

1. Stem voice/music peaks already returned on Cut detail MUST remain the source for A2 / stem lanes — no client re-decode.
2. Original (A1) peaks: WHEN not present on the Cut/media payload, the editor MUST NOT full-download+`decodeAudioData` during the critical open path. Defer until the waveform lane is visible or the document is idle.
3. **Wave 3:** During the audio analysis stage (after `extractAudioTrack`, independent of Demucs), the runner MUST compute mix waveform peaks (default 240 buckets) from the mono WAV and persist them. Cut detail and media detail MUST return `mixPeaks` alongside stem peaks. Client stream decode is fallback-only when `mixPeaks` (and voice peaks for Cut A1) are absent.
4. Storage: `media_waveform_peaks` keyed by `(media_asset_id, analysis_run_id)` — not shoehorned into `media_audio_stems` (which requires stem WAV bytes).
5. **Wave 4 backfill:** WHEN Cut/media detail lacks `mixPeaks` for timeline media THEN the client MAY idle-request `POST /api/media/:id/peaks-backfill` (Model B, concurrency ≤ 1) so existing assets catch up without a full vision re-run.

### Bin / Timeline laziness

1. `CutBinPanel` / `MediaCardThumb`: load poster only when the card intersects the rail viewport (root ≈ rail body); cap concurrent frame requests (≤ 4).
2. `TimelineClipThumbnail`: load only for clips intersecting the timeline viewport (or adjacent buffer of ±1 clip).
3. Placeholder chrome MUST reserve aspect ratio so layout does not jump when JPEG arrives.
4. WHERE Frame API fails after the shell is up THEN optional client capture MAY run with concurrency ≤ 2 — never on the open critical path.
5. Media editor filmstrip and scene evidence strips MUST prefer Frame API when `mediaAssetId` + `platformProjectId` are known.

## Surfaces

| Surface | Open behaviour |
|---------|----------------|
| AppShell + Cut topbar trail | Immediate |
| Program monitor | Shell immediate; video src after single playback resolve |
| Timeline dock | Ruler/clips chrome immediate; posters lazy; peaks deferred |
| Bin Mediathek grid | Search + card meta immediate; posters lazy via Frame API |
| Right clip inspector | Unchanged (selection-driven) |

## Requirements (EARS)

1. WHEN the operator opens `/cuts/:id` THEN the product top chrome, program monitor frame, and timeline dock MUST render after Cut detail JSON without waiting for Bin posters, timeline posters, or A1 waveform decode.
2. WHEN a Bin or timeline poster is needed THEN the client MUST request `GET /api/media/:id/frame` (with `platformProjectId` + `t`) as the primary poster source — NOT start a hidden video decode by default.
3. WHEN multiple surfaces need the same media playback URL concurrently THEN the editor MUST resolve it at most once (shared in-flight promise or equivalent).
4. WHEN the Bin grid has more cards than fit the rail viewport THEN off-screen cards MUST NOT fetch frames until they approach visibility.
5. WHEN A1 waveform peaks are missing on open THEN the editor MUST defer full-stream audio decode until idle or the waveform lane is visible.
6. WHERE the Frame API returns `503` / failure THEN the UI MUST keep a poster placeholder and MAY retry or fall back to bounded client capture — it MUST NOT block editor interaction.
7. WHEN Cut detail already includes stem peaks THEN stem lanes MUST use those peaks and MUST NOT download stem WAVs solely to draw waveforms on open.

## Acceptance

- [x] Specs: this doc + `media-frame.md` notes editor poster reuse; `knowledge/paths.md` already lists `apiMediaFrame`.
- [x] Open Cut with 1 clip + ≥ 8 library videos: Bin does not fire ≥ 8 frame/stream poster loads before first paint of the grid placeholders. *(lazy `useInViewOnce` + `withFrameRequestSlot` ≤ 4)*
- [x] Network: at most one playback-URL resolution for the active media during open (no duplicate `apiMediaPlayback` race). *(direct `mediaStreamPlaybackUrl`; idle map for others)*
- [x] Bin + timeline posters use Frame API in code paths (`MediaCardThumb` / `TimelineClipThumbnail` or shared helper).
- [x] No full-media `decodeAudioData` on the critical open path (assert via code contract test / optional staging trace). *(A1: visible lane + idle; no bulk prefetch)*
- [x] A1 waveform decode starts only when the audio lane is near-viewport, then idle-deferred (`TimelineAudioTrack` `lazyPeaks`).
- [x] Frame poster fetches share a concurrency gate of ≤ 4 (`withFrameRequestSlot` / `useFramePoster`).
- [x] Audio analysis persists `mixPeaks`; Cut/media detail return them; client decode is fallback-only when missing.
- [x] Frame failure MAY fall back to client capture with concurrency ≤ 2.
- [x] Media editor filmstrip + scene evidence prefer Frame API when media ids are known.
- [x] Wave 4: Analysis warms S3 posters; Frame route prefers S3 + long HTTP cache; clients use direct Frame URLs.
- [x] Wave 4: Program monitor uses Frame poster + `preload="none"` until play.
- [x] Wave 4: Idle `peaks-backfill` for timeline media missing `mixPeaks`.
- [ ] Staging smoke: open known Cut — chrome interactive before posters fill; timeline still editable while thumbs load.
- [ ] Regression: insert from Bin (video + scene), playhead, export entry points still work.

## Implementation sketch (non-normative)

| Area | Likely touch |
|------|----------------|
| Shared poster hook | Replace/gate `use-clip-thumbnail.ts` with `useMediaFramePoster` → `apiMediaFrame` |
| Bin | `cut-bin-panel.tsx` + `media-card-thumb.tsx` — IO lazy + concurrency |
| Timeline | `timeline-clip-thumbnail.tsx` / `cut-timeline.tsx` — visible clips only |
| Playback | `cut-editor-view.tsx` — dedupe map; defer non-active prefetch |
| Waveform | `use-waveform.ts` + cut open effects — idle gate; peaks on detail later |

## Out of scope follow-ups

- CDN in front of Frame objects (auth/signed delivery).
- WebCodecs / MSE advanced players.
- Virtualized Bin / timeline DOM for very large libraries.
- Prefetch preview MP4 for scrubbing.
