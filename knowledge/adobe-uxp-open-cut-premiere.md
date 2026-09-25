# Adobe UXP — Open Cut in Premiere (operator / implementer notes)

**Spec:** `specs/domain/adobe-uxp-open-cut-premiere.md`  
**Updated:** 2026-09-10  

## One-liner

Cuts tab → ensure `premiere_xml` ZIP → extract (`xml` + `media/`) → try `importFiles(xml)` (**auto_import**) → on failure reveal + Import hint.

**UI status (≥ 0.1.36):** Cuts tab **paused** (`ENABLE_CUTS_TAB`). Day-to-day panel = Clips & Szenen search/insert. See `knowledge/adobe-uxp-provider-first.md`.

**Premiere refresh (when Cuts revived):** in-place patch **paused**. Use **Cut neu laden** for explicit ZIP replace.

## Modes

| Panel mode | Unit | Result |
|------------|------|--------|
| Szenen (Wave 1) | Scene hit | Clip → Bin / active sequence |
| Cuts (Open Cut) | Whole Cut | Sequence from XMEML |

## Wave B UI (locked)

- Tabs: **Szenen** | **Cuts** under Collection bar.
- Cuts requires pinned Collection (not “alle”).
- Row: name · canvas · scene count · updated · actions **In Premiere öffnen** / **ZIP cachen**.
- Phases: `Export…` → `Download…` → `Entpacken…` → `Import…` (or `Bereit zum Import…` on fallback).

## Modules (≥ 0.1.18)

`cuts-api.js` · `open-cut.js` · `open-cut-model.js` · `open-cut-cache.js` (fflate via browser build in `build.cjs` — Node entry breaks UXP) · `premiere-open-cut.js` (`openCutInPremiere` / `autoImportOpenCutXml` / `revealAndPromptOpenCut`)

## Operator reload

UDT Unload → Load repo folder; header **v0.1.32**. Pin Collection → Cuts → **In Premiere öffnen**.

- Success `auto_import`: banner like `Sequenz importiert: …` (+ optional Clip-Name stamp)
- Success `in_place_patch`: banner like `N Video-Clip(s) … · M Audio` (optional `· Multi-Signal-Match`)
- Patch fail: error banner — sequence untouched; use **Sequenz ersetzen** only if you accept FX loss
- Fallback `reveal_and_prompt`: Import-Hinweis + XML-Pfad (+ Auto-Import reason)

## API

- `GET /api/cuts?platformProjectId=`
- `POST /api/cuts/:id/exports` `{ format: "premiere_xml" }`
- `GET /api/cuts/:id/exports/:exportId` → `downloadUrl`  

`paths.routes.apiCuts` / `apiCutExports` / `apiCutExport`.

## Wave C notes

- Uses same `Project.importFiles` as media insert; XML path must be local `nativePath` next to `media/`.
- `importSequences` is for another project — not used.
- Staging checklist: multilayer Cut → auto_import → media online? V2/VO audible? → record pass/fail here.

## Artifact SSOT

`specs/domain/cut-export-extras.md`
