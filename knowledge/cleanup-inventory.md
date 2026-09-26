# Cleanup inventory — videon-v3

**Date:** 2026-09-26  
**Inventor:** Inventor (suite cleanup)  
**Playbook:** plexon-v3 `knowledge/suite-cleanup.md`  
**Keep/drop:** `knowledge/keep-drop-backlog.md`

| Path | Klasse | Nachweis | Notes |
|---|---|---|---|
| `knowledge/legacy-migration-opt-in.md` | keep | `paths.md` · `specs/domain/v7-production-rollout.md` · contracts parser | V7 opt-in policy; no blanket `chbrdk/videon` backfill. Importer tooling not in repo yet — doc stays SSOT. |
| `packages/contracts/src/legacy-migration.ts` (+ `dist/legacy-migration.*`) | keep | Exported from `packages/contracts/src/index.ts`; Vitest in `index.test.ts` | Live schema `videon.legacy-migration.v1`; not orphaned code. |
| `knowledge/v7-staging-exercise-log.md` | keep | Runbook companion; records `Legacy mapping: N/A` | Operational evidence for staging gate; do not drop with runbook. |
| `knowledge/v7-production-runbook.md` (legacy v2 Coolify UUID `q8c8gwwck404k04okkkwskgk`) | keep | `paths.md` · V7 archive procedure | Freeze/archive instructions for legacy island — live ops, not obsolete knowledge. |
| `apps/web/lib/msqdx-ui.ts` (`EntityCard` re-exports) | drop_safe **done** 2026-09-26 | No app imports | Barrel lines removed (Querschnitt). |
| `apps/web/app/globals.css` (`.videon-nle__toolbar-menu*`) | drop_safe **done** 2026-09-26 | No TSX/HTML class refs; `editor-overflow-menu.tsx` replaced native `<details>` | Removed orphan CSS block. |
| `apps/web/components/ai-create-dialog.tsx` · `ai-edit-dialog.tsx` (native `<select>`) | drop_needs_rebuild **done** 2026-09-26 | `Field` + `@msqdx/ui` `Select` | Native `<select>` removed from AI dialogs. |
| `apps/web/components/pipeline-status-track.tsx` · `editor-status-strip.tsx` · `scene-inspect-navigator.tsx` · `scene-insight-inspector.tsx` (`StatusDot` + static `Chip` for pipeline/brand status) | drop_needs_rebuild **done** 2026-09-26 | Status → `Badge` tones | Filter `Chip` in `media-library.tsx` kept. |
| `apps/web/components/editor-transport.tsx` · `cut-editor-view.tsx` · `media-editor-view.tsx` · … (`ToolButton` with `label=` + visible text children) | keep (icon-only) | `label=` = aria/title only; children are icons | Text actions (Bin/Inspect/Clip) already `Button` ghost/sm. |
| `apps/web/app/globals.css` (`.videon-nle` `--nle-*` hex fallbacks, e.g. `#f8f6f0`, `#ff6b00`) | reshape **done** 2026-09-26 | Theme vars only (`--nle-void` / `--nle-warn` / `--nle-signal`) | Parallel hex palette removed from NLE aliases + playhead/clip fallbacks. |
| `knowledge/staging-coolify-fal-generation.md` | reshape | Referenced from `paths.md` + `ai-clip-generation.md`; body documents OpenRouter | Filename is legacy (fal.ai); content is current. Rename + path needle update is doc-only reshape, not drop. |
| `apps/web/components/platform-assistant-host.tsx` (+ mount in `app-shell.tsx`) | defer | Live AppShell; keep-drop **Defer** PlatformAssistantHost | Spec/knowledge: `knowledge/platform-assistant-host.md`. Out of UI-rebuild scope — keep until product defers embed. |
| `tools/adobe-uxp-library-panel/` | keep | Spec `specs/domain/adobe-uxp-library-panel.md`; many `knowledge/adobe-uxp-*.md` | Active UXP client — not legacy CEP/PrismVid port. Spec explicitly **Drop** CEP for new work only. |
| `knowledge/videon-aspect-glyph-bump.md` | keep | Pin record for `AspectPresetChips` / msqdx-ui ref | Small historical bump note; still useful for dependency archaeology — prefer keep when unsure. |
| *(no committed `*.legacy-migration.json` fixtures)* | keep | Importer „when tooling lands“ per `legacy-migration-opt-in.md` | Nothing to delete; avoid adding sample reports with real UUIDs to repo without Gatekeeper review. |

## Keep-drop vs code — summary

| Backlog decision | Code reality (2026-09-26) |
|---|---|
| **Drop** `EntityCard` in Mediathek | **Done** in `media-library.tsx` + barrel export removed. |
| **Drop** native `<details>` toolbar menu | **Done** in components + orphan CSS removed. |
| **Drop** native `<select>` in Editor | **Done** in AI create/edit dialogs (`Select` from `@msqdx/ui-client`). |
| **Drop** status `Chip`/`StatusDot` | **Done** 2026-09-26 — pipeline/editor/scene status use `Badge` tones. |
| **Drop** text `ToolButton` labels | **Done** — `label=` is aria only; Bin/Inspect/Clip are ghost `Button`. |
| **Defer** PlatformAssistantHost | **Mounted** — intentional. |

## Suggested Gatekeeper `drop_safe` candidates (this repo)

1. ~~`apps/web/app/globals.css` — `.videon-nle__toolbar-menu`~~ **done** 2026-09-26.

Not yet `drop_safe`: — (NLE hex reshape done; remaining polish is optional).
