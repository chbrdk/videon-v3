# Adobe UXP — Open Cut in Premiere

**Status:** Draft — 2026-09-10 (Waves A–B locked; **Wave C auto_import shipped** with reveal fallback; staging smoke open)  
**Product:** VIDEON v3  
**Federation:** `2026-05-plexon-federation-v3`  
**Companions:**  
- `specs/domain/adobe-uxp-library-panel.md` (panel core — search/insert Wave 1)  
- `specs/domain/cut-export-extras.md` (Premiere ZIP / XMEML SSOT)  
- `specs/domain/cut-multi-track.md` (V1/V2/VO track semantics in XMEML)  
- `specs/api/cuts.md` (list cuts · enqueue/poll exports)  
**Knowledge:** `knowledge/paths.md` · `knowledge/adobe-uxp-open-cut-premiere.md`  
**Implements (later):** `tools/adobe-uxp-library-panel/` — Cuts mode UI + `open-cut.js` + Premiere reveal/import adapter  

## Purpose

Let an editor pick a **Cut** from the Collection-scoped VIDEON library inside the Premiere UXP panel and land it as a **Premiere sequence with tracks** (video + linked audio / VO / V2 overlays), without leaving the NLE and without re-assembling the timeline clip-by-clip in the panel.

The sequence truth is the existing **`premiere_xml` ZIP** (XMEML + `media/`). The panel is a **delivery client**, not a second exporter.

## Problem

Wave 1 panel insert is great for **scene reuse** into an existing sequence. Cuts already encode multi-track editorial intent (V1, V2, audio bus / VO). Today the operator must: Cut editor → Export Premiere ZIP → unzip → File → Import XML. That breaks the “stay in Premiere” promise for finished Cuts.

## Relationship to Wave 1 panel

| Capability | Wave 1 (current) | This wave (Open Cut) |
|------------|------------------|----------------------|
| Unit of work | Scene / media hit | Whole **Cut** |
| Product artifact | Source file + In/Out | **`premiere_xml` ZIP** |
| Premiere result | Bin item ± insert into **active** sequence | New / imported **sequence** with exploded tracks |
| Track authorship | Operator / existing sequence | XMEML from Cut export |

Both share: Settings Bearer auth, Collection picker, UXP data-folder cache, Access Model B, no signed URLs in search lists.

## Non-goals

- **Automatic** bidirectional sync (Premiere edits do **not** write back continuously). Manual pushback is a **separate** draft: `adobe-uxp-cut-pushback-premiere.md`.
- Live / continuous sync while the Cut changes in VIDEON (one-shot open / refresh-on-demand only).
- Rebuilding sequences clip-by-clip via SequenceEditor APIs as the primary path (too fragile vs XMEML).
- Cut authoring, trim, or multi-track edit inside the panel.
- Opening Cuts in After Effects, FCP, or Resolve from this wave (AE stays Wave 1.5 scene insert; other NLEs keep ZIP handoff).
- Shipping bare XMEML without `media/` (breaks offline link).
- FCPXML (dropped in `cut-export-extras.md`).
- Using `PLEXON_SERVICE_SECRET` or team tokens from the panel.

## Operator story (happy path)

1. Panel is connected (token + Collection).
2. Operator switches mode to **Cuts**.
3. Sees Cut list for the pinned Collection; picks one.
4. Chooses **In Premiere öffnen**.
5. Panel ensures a ready `premiere_xml` export (reuse latest succeeded when still valid; otherwise enqueue).
6. Downloads the ZIP into the UXP cache, extracts beside it.
7. Wave B: reveals extract folder + copies XML path / shows Import hint.  
   Wave C (if spike ok): auto-imports XMEML via host API.
8. Panel reports mode used (`reveal_and_prompt` \| `auto_import`) — never fake sequence success.

---

## Wave B — locked UX + pipeline

Wave B is the **shippable GA** path even if auto-import never lands. It ends at a correct extract + honest operator handoff.

### B.1 Mode switch (UI sketch)

Top of workspace (below Collection bar), two mutually exclusive modes — plain UXP buttons, not a second plugin:

```
┌─────────────────────────────────────────┐
│ VIDEON  vX.Y.Z              Einstellungen│
│ [ Collection ▾ ]                        │
│ ┌──────────┐ ┌──────────┐               │
│ │ Szenen   │ │  Cuts    │  ← mode tabs  │
│ └──────────┘ └──────────┘               │
│                                         │
│  (mode = Szenen → existing search UI)   │
│  (mode = Cuts   → Cut list below)       │
└─────────────────────────────────────────┘
```

Rules:

1. Default mode remains **Szenen** (Wave 1).
2. Switching to **Cuts** hides scene search + hit grid + insert bar; shows Cut list chrome.
3. Switching back MUST cancel in-flight Open Cut work (abort controller) and MUST NOT leave a half-written extract as “success”.
4. AE host: Cuts tab MAY be visible but primary actions MUST return `unsupported` with copy that Open Cut is Premiere-only.

### B.2 Cuts list chrome

```
┌─────────────────────────────────────────┐
│ Cuts                          [Aktual.] │
│ 3 in Collection                         │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ Sommerkampagne Final                │ │
│ │ 16:9 · 12 Szenen · vor 2 Std.       │ │
│ │ [In Premiere öffnen] [ZIP cachen]   │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ VO Rough                            │ │
│ │ 9:16 · 4 Szenen · gestern           │ │
│ │ Badge: Export nötig                 │ │
│ │ [In Premiere öffnen] [ZIP cachen]   │ │
│ └─────────────────────────────────────┘ │
│ empty → „Keine Cuts in dieser           │
│          Collection.“                   │
└─────────────────────────────────────────┘
```

Row fields (from `GET /api/cuts` + optional detail):

| Field | Source | Display |
|-------|--------|---------|
| Name | cut.name | Title |
| Canvas | width×height or preset label if known | `16:9` / `1080×1920` / `—` |
| Scene count | scenes length if present, else omit | `N Szenen` |
| Updated | `updatedAt` | Relative or short locale time |
| Export badge | local heuristic vs last known export | `Export bereit` \| `Export nötig` \| hidden |

List constraints:

1. `platformProjectId` **required** — if Collection is “alle zugänglichen”, panel MUST prompt to pin a Collection before listing Cuts.
2. Hard UI cap: show at most **40** Cuts (newest `updatedAt` first). If API returns more, show “+N weitere — in VIDEON öffnen” (href via product base + `paths.routes.cut` / cuts hub) — no pagination in Wave B.
3. List payloads MUST NOT include `downloadUrl`.
4. No create / rename / delete / duplicate.

### B.3 Actions

| Control | Behavior |
|---------|----------|
| **In Premiere öffnen** | Full pipeline → end in `reveal_and_prompt` (Wave B) or `auto_import` (Wave C) |
| **ZIP cachen** | Same through extract; skip import/reveal host call; status: “ZIP bereit: …” + path |
| **Aktualisieren** | Reload Cuts list |
| Row click (non-button) | Select row only (highlight); does not start open |

Only **one** Open Cut / cache job at a time. Second click MUST be ignored or queued message “Bitte warten…”.

### B.4 Progress phases (banner / row status)

Exact phase labels (DE, locked for QA):

| Phase id | Label | When |
|----------|-------|------|
| `export` | `Export…` | Enqueue + poll `premiere_xml` |
| `download` | `Download…` | Fetch ZIP bytes |
| `extract` | `Entpacken…` | Unzip to cache key folder |
| `handoff` | `Bereit zum Import…` | Wave B reveal / clipboard |
| `import` | `Import…` | Wave C only |
| `done` | `Fertig · {mode}` | Terminal success of chosen mode |
| `error` | `Fehler · {short}` | Terminal failure |

Progress MUST be visible on the active row and/or global banner. Silent hangs are forbidden.

### B.5 Pipeline (state machine)

```
idle
  → ensure_export   (reuse or POST exports format=premiere_xml)
  → poll_export     (GET export until succeeded|failed; backoff)
  → download_zip    (signed downloadUrl or future Bearer proxy)
  → extract_zip     (layout: xml + media/ + README)
  → handoff         (Wave B: reveal_and_prompt)
  → import          (Wave C only; on failure → handoff)
  → done | error
```

Abort: any user mode switch / new job / panel unload MUST abort poll/download; partial extract folders MAY remain and MUST be eligible for cache eviction.

### B.6 Export reuse (Wave B lock)

1. Prefer latest **succeeded** `premiere_xml` export for the Cut when `export.createdAt >= cut.updatedAt` (string/ISO compare after parse).
2. Else enqueue with idempotency key: `open-cut:{cutId}:{cut.updatedAt}`.
3. Poll: start 1s, backoff ×1.5, cap 5s, overall timeout **10 minutes**; then `error` with retry CTA.
4. No Product `inputHash` required for Wave B (open question deferred to Wave C / Product polish).

### B.7 Cache & extract

Cache key:

```
{cutId}:premiere_xml:{exportId}:{checksumOrBytes}
```

Extract root:

```
{uxpData}/open-cut/{safeKey}/
  {sanitizedCutName}.xml
  media/…
  README.txt
```

Requirements:

1. Extract MUST preserve relative layout so `file://media/…` resolves.
2. Soft caps share media-cache eviction spirit: max **8** Open Cut extract trees; max **4 GiB** combined Open Cut cache (evict oldest `at` first).
3. Settings **Cache leeren** MUST also clear Open Cut extracts (or document a separate clear control — Wave B: clear together).
4. ZIP inflate in UXP: prefer a small dependency-free unzip if feasible; otherwise document chosen lib in knowledge (no Node `fs` in panel).

### B.8 `reveal_and_prompt` (Wave B GA)

On successful extract:

1. Resolve absolute path to the `.xml` file (`nativePath`).
2. Best-effort: copy path to clipboard (`clipboard` permission already in manifest).
3. Best-effort: reveal folder via UXP shell / `showInFolder` if available; else show path in banner.
4. Banner copy (locked):  
   `ZIP entpackt. In Premiere: Datei → Importieren → XML wählen.`  
   Second line: absolute XML path (monospace / selectable).
5. Result object: `{ ok: true, mode: 'reveal_and_prompt', xmlPath, extractDir, cutId, exportId }`.
6. MUST NOT set `mode: 'auto_import'` in Wave B builds.

### B.9 Module plan (implementation map)

| Module | Responsibility |
|--------|----------------|
| `src/index.html` / CSS | Mode tabs + Cuts list + row actions |
| `src/cuts-api.js` (new) | `listCuts`, `enqueuePremiereExport`, `getExport`, poll helper |
| `src/open-cut.js` (new) | State machine, cache key, download, extract, handoff |
| `src/premiere-open-cut.js` (new) | `reveal_and_prompt` + later `auto_import` |
| `src/premiere.js` | Unchanged scene insert; MAY share `importFiles` helper later for Wave C |
| Tests | Contract strings + pure helpers (poll backoff, reuse predicate, cache key) |

Paths: use `paths.routes.apiCuts` / `apiCut` / `apiCutExports` / `apiCutExport` — add panel wrappers that concatenate `productBaseUrl` like existing `api.js`.

### B.10 Wave B acceptance

1. Mode tabs Szenen | Cuts; Collection required for Cuts list.
2. List ≤40 Cuts; empty + error states.
3. Open → phases visible → extract with xml + `media/`.
4. Banner + clipboard path; `mode: reveal_and_prompt`.
5. ZIP cachen stops before reveal host call but leaves same extract.
6. AE / non-Premiere: `unsupported` for open action.
7. Export failure → error, no fake success.
8. Unit/contract tests for reuse predicate, cache key, phase labels, spec locks.
9. Staging smoke: multilayer Cut ZIP from panel extract imports manually in Premiere (V1/V2/VO).

---

## Product API (reuse — no parallel export)

| Step | Route | Notes |
|------|-------|--------|
| List Cuts | `GET /api/cuts?platformProjectId=` | Model B; panel shows picker only |
| Cut detail (optional) | `GET /api/cuts/:cutId?platformProjectId=` | Name, canvas, updatedAt for cache validity |
| Enqueue Premiere package | `POST /api/cuts/:cutId/exports` body `{ "format": "premiere_xml", "idempotencyKey"? }` | Same job as Cut editor |
| Poll / download meta | `GET /api/cuts/:cutId/exports/:exportId` | `{ export, downloadUrl? }` when succeeded |
| Bytes | Fetch `downloadUrl` (short-lived signed) **or** future Bearer proxy if UXP signed-fetch proves unreliable | ZIP only — never MP4 for this flow |

Paths only via `apps/web/lib/paths.ts` — document any new helper in `knowledge/paths.md`.

List / search payloads MUST NOT embed `downloadUrl`.

---

## Premiere host adapter

### Import modes (honesty ladder)

| Mode | When | Behavior |
|------|------|----------|
| **`auto_import`** | Wave C — UXP can import XMEML | Panel triggers import; reports sequence when knowable |
| **`reveal_and_prompt`** | Wave B GA + Wave C fallback | Extract + reveal / clipboard + Import hint |
| **`unsupported`** | Not Premiere | Refuse; do not fake success |

Requirements:

1. WHEN host is not Premiere THEN Open Cut MUST return `unsupported`.
2. WHEN extract succeeds but import fails THEN fall down to `reveal_and_prompt`.
3. WHEN `auto_import` runs THEN keep extracted `media/` tree (do not break `pathurl`).
4. MUST NOT invent track layout in SequenceEditor as substitute for XMEML.

### Track fidelity

Owned by `cut-export-extras.md` / XMEML generator. Panel MUST NOT re-interpret multi-track rules.

---

## Auth & tenancy

Same as `adobe-uxp-library-panel.md`: Settings API Bearer (`videon_…`), Collection-scoped `platformProjectId`, Access Model B.

---

## EARS (all waves)

1. WHEN the operator opens a Cut in Premiere THEN the system MUST deliver a `premiere_xml` ZIP whose XMEML + `media/` match `cut-export-extras.md`.
2. WHEN a valid succeeded export already matches the Cut (`createdAt >= updatedAt`) THEN the panel MUST NOT enqueue a duplicate export.
3. WHEN the export is not ready THEN the panel MUST enqueue `format=premiere_xml` and wait with visible progress until terminal state.
4. WHEN the ZIP is cached THEN extract layout MUST keep `{name}.xml` beside `media/` so relative `pathurl`s resolve.
5. WHEN auto-import is unavailable or fails AFTER a successful extract THEN the panel MUST use `reveal_and_prompt` and MUST NOT report sequence success.
6. WHEN the host is not Premiere THEN Open Cut MUST fail closed (`unsupported`).
7. WHEN export fails THEN the panel MUST surface failure and MUST NOT open a partial/empty sequence as success.
8. WHERE Cuts are listed THEN payloads MUST NOT include signed download URLs.
9. WHEN Open Cut runs THEN the panel MUST NOT author tracks via ad-hoc SequenceEditor clip placement as the primary implementation.
10. WHEN Collection is unset (all-accessible) THEN Cuts mode MUST require pinning a Collection before list/open.
11. WHEN Open Cut completes with successful host import THEN result.mode MUST be `auto_import`.
12. WHEN auto_import is unavailable or fails AFTER extract THEN result.mode MUST be `reveal_and_prompt` (honest fallback).

---

## Waves & acceptance

### Wave A — Spec + API reuse

- [x] Domain intent + non-goals + honesty ladder locked
- [x] Companion knowledge + paths cross-links
- [x] Contract test locks key phrases

### Wave B — Panel Cuts picker + ZIP cache/extract + reveal

- [x] UX sketch + phase labels + state machine locked
- [x] Implement Cuts mode UI + `cuts-api` / `open-cut` modules (panel ≥ 0.1.17)
- [x] Extract + `reveal_and_prompt`
- [x] Unit/contract tests
- [ ] Staging smoke (manual XML import after panel extract)

### Wave C — `auto_import` (host-dependent)

**Implementation (≥ 0.1.18):** `openCutInPremiere` → `Project.importFiles([xmlNativePath], suppressUI, VIDEON bin, false)`; detect new sequence via `getSequences` delta; best-effort `openSequence` / `setActiveSequence`. On any failure → `reveal_and_prompt` with reason in banner.

- [x] Wire `auto_import` with reveal fallback
- [x] Contract tests lock `openCutInPremiere` / `autoImportOpenCutXml`
- [ ] Staging smoke on Premiere ≥ 25.6: multilayer Cut → media online? V2/VO? document in knowledge

**Acceptance:** Supported hosts prefer one-click sequence; others/failures stay on Wave B reveal.

---

## Open questions

| # | Question | Wave B lock | Still open |
|---|----------|-------------|------------|
| 1 | UXP XMEML auto-import API | Reveal GA | Implemented via `importFiles`; staging verify |
| 2 | Content stamp | `updatedAt` vs export `createdAt` | Product `inputHash` later |
| 3 | Sequence name collision | N/A in reveal; Premiere decides on Import | Wave C: prefer unique name / let Premiere prompt |
| 4 | Cache caps | 8 trees / 4 GiB Open Cut | Tune after telemetry |
| 5 | Bearer ZIP proxy | Try signed URL first | Add if UXP fetch fails |

---

## Capability alignment

| Surface | Relation |
|---------|----------|
| Cut editor Export Premiere ZIP | Same job / artifact; panel is alternate client |
| MCP / Flow `videon.export.run` `premiere_xml` | Agent path; panel is human NLE path |
| Panel Wave 1 scene insert | Complementary |
| Cut pushback from Premiere | Separate draft — `adobe-uxp-cut-pushback-premiere.md` (manual only) |
| Catalog | Optional later `videon.cut.open_premiere` |
