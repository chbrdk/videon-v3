# Panel scenes/clips provider polish

**Status:** Active — panel ≥ **0.1.46**  
**Strategy:** `knowledge/adobe-uxp-provider-first.md`  
**Spec:** `specs/domain/adobe-uxp-library-panel.md` § Provider-first · Insert semantics  

## Goals (2026-09-10)

1. **Insert reliability** — scene In/Out on the Bin clip, then optional Sequence insert at playhead.
2. **Clearer hit cards** — filename, scene ordinal, In/Out + duration, snippet, project.
3. **Scene metadata capture** — panel hit-model mirrors Product `scene-hit-model` (incl. ordinal labels).

## Insert flow (Premiere)

1. `importFiles` into VIDEON Bin (local cache path only).
2. Resolve clip: path match → settle retries → Bin-scoped name match.
3. **In/Out:** `createClearInOutPointsAction` (if present) → `createSetInOutPointsAction` with `TickTime.createWithSeconds`; verify via `getInPoint`/`getOutPoint` when available.
4. **Sequence (opt-in, default on):** `SequenceEditor.createInsertProjectItemAction` at playhead V1/A1; on failure try `createOverwriteItemAction` at same time.
5. Banner reports In/Out applied or skipped + Sequence note — never silent partial success without a hint.

## Hit card chrome

| Element | Content |
|---------|---------|
| Media badge | `00:01–00:03 · Δ 00:02` |
| Title | `mediaFilename` |
| Chips | Szene-Ordinal · Collection/project |
| Snippet | `searchText` or muted empty-snippet hint |
| Actions | **Anzeigen** (detail overlay) + compact **+** insert |

Detail overlay: `knowledge/adobe-uxp-hit-detail-overlay.md` (≥ 0.1.46).

## Gates

Cuts tab / in-place sync remain off (`panel-features.js`).
