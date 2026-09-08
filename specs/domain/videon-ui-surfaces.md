# VIDEON UI surfaces

**Status:** Active  
**Product:** VIDEON v3  
**Companion:** `knowledge/ui-rebuild-reuse.md`, PLEXON federation (`2026-05-plexon-federation-v3`)

## Purpose

Normative IA for Collection-bound VIDEON hubs and editor chrome. Behaviour for federation/media/jobs remains in PLEXON integration notes; this spec owns **UI composition** against `@msqdx/ui`.

## Guarantees

1. WHEN a hub page renders THEN it MUST compose shared primitives from `@msqdx/ui` (via app barrels) for titles, empty states, lists/cards, chips, meters, and forms.
2. WHEN a shared chrome need appears (button, panel, transport, monitor shell, timeline shell) THEN VIDEON MUST add or reuse a primitive in `msqdx-ui` — NOT invent an app-local clone.
3. WHILE the Cuts/Media editor owns playback and edit domain logic, the visible chrome (transport, monitor frame, timeline ruler/track/clip shell, icon tools) MUST use DS primitives after Wave 2.
4. WHERE Collection context is missing, hubs MUST fail closed (gate + EmptyState), never invent a second project model.

## Information architecture

1. WHEN the operator works in VIDEON THEN each **Projekt** is one PLEXON Collection (`platformProjectId`) — NOT a nested “Projects contain Collections” model.
2. WHEN user-facing copy names that entity THEN it MUST say **Projekt** / **Project** (DE/EN). Internal code, federation, and APIs MAY still say Collection / `platformProjectId`.
3. WHEN the NavRail renders THEN PRIMARY MUST include **Projekte** and **Mediathek** as peers (Checkion/Audion-style project hub + media library) — NOT hide projects only in a footer switcher.
4. WHEN the **Projekte** hub renders THEN it MUST list Access Model B accessible projects (same catalog as `/api/collections`) and set active project context on select.
5. WHEN the **Mediathek** hub renders THEN it MUST list media across **all** accessible projects by default (fail-closed via Plexon directory ∩ local workspace membership). Optional `?platformProjectId=` MAY filter to one project.
6. WHEN Upload / Analysen / Cuts / media detail / cut editor need a write or editor context THEN they MUST remain **project-gated** (`WorkspaceRouteGate` / `platformProjectId`).
7. WHERE `/collections` remains THEN it MUST redirect or alias to the Projekte hub (`/projects`).

## Surfaces

| Route | Role | DS composition |
|-------|------|----------------|
| `/` | Home magazine | Cover + `HubIndexCard` (Projekte, Mediathek, …) + activity |
| `/projects` | Projekte hub (Access Model B) | `HubIndexCard` grid |
| `/collections` | Alias → `/projects` | redirect |
| `/library` | Mediathek — all accessible projects (optional project filter) | Header + cards/list + browse filters |

## Mediathek browse (Wave A)

1. WHEN the media list loads THEN each item MUST expose `durationMs` and `latestAnalysisStatus` for card/list chrome.
2. WHEN the card layout is active THEN cards MUST use native `@msqdx/ui` `Card` (+ `CardActions`) with media/title/meta slots — NOT `EntityCard` (catalog) and NOT `HubIndexCard` (magazine headlines).
3. WHEN browse cards render THEN they MUST be **square-cornered** (`border-radius: 0`) in a hairline magazine grid — same eckige Kachel-Sprache as Checkion collection cards / Audion hub panels; NOT the default DS panel radius.
4. WHEN filters and search are shown THEN they MUST share one browse band: search input + icon submit (`ToolButton` + search icon), lifecycle `FilterRow`+`Chip`, analysis `FilterRow`+`Chip`, and layout switch — NOT a separate search block above disconnected filter rows with a text „Suchen“ button.
5. WHEN item status is shown on browse cards/list THEN it MUST use toned `@msqdx/ui` `Badge` (lifecycle + analysis) — NOT uncolored static `Chip`s and NOT a lone green `StatusDot` for “keine Analyse”.
6. WHERE quick actions appear THEN they MUST link to open / analyses / cuts without nesting interactive controls inside the card anchor.
| `/upload` | Ingest | `Field` + native file input + `Button` |
| `/analyses` | Vision runs (dense) | `RankedList` / `RankedRow` + `Badge` + `barPct` — NOT per-row `StepStrip`/`Meter` |
| `/cuts` | Cut index | `HubIndexCard` / `RankedList` |
| `/settings` | Account / appearance / language | `SettingsShell` per `settings.md` (theme default light, en/de) |
| `/media/:id`, `/cuts/:id` | NLE | `MediaMonitor`, `TransportBar`, `Timeline*`, `FloatingPanel` / `InspectTabs`, `Toast` |

## Editor IA (Wave B)

1. WHEN the side drawer is open THEN it MUST use `InspectTabs` for panel switching (scenes / transcript / search / pipeline / bin).
2. WHEN the side drawer is open THEN its width MUST be user-resizable (drag handle on the leading edge) and SHOULD persist in `sessionStorage` (`videon.editor.drawerWidthPx`).
3. WHEN analysis or export status is visible THEN the editor MUST show `EditorStatusStrip` (StatusDot + Text), not a second toolbar row of ad-hoc notices.
4. WHEN a non-fatal action succeeds or fails THEN feedback MUST go through `Toast` (`ToastProvider` in app providers). Fatal empty-state errors MAY remain inline.
5. WHILE the toolbar stays dense, primary edit/export actions MUST stay visible; secondary actions (download, archive, brand) MUST live under a “Mehr” disclosure.
6. WHEN the pipeline panel is shown in the drawer THEN `PipelineStatusTrack` MUST use `StepStrip orientation="vertical"` — not a horizontal scroller of stage cards.
7. WHEN the operator chooses „Analyse“ THEN the editor MUST open an `@msqdx/ui` `Dialog` with `Checkbox` options for the four analysis user bundles (Szenen & Vision, Transkript, Stems Demucs, Zusammenfassung), all checked by default — see `analysis-capabilities.md`. Start MUST NOT fire until the dialog is confirmed.

## Scenes inspect (Wave D)

1. WHEN the scenes tab lists analysed scenes THEN each navigator row MUST show a **truncated** label (≈72 chars via `timelineClipLabel`), a `Timecode` range, and an optional Brand status (`StatusDot` + `Chip`/`Badge`) — NOT the full `insight.summary` as the row title.
2. WHEN a scene is selected THEN the detail pane MUST show the full summary once as `Text` body, then primary facts (Brand, Personen, Objekte, Aktionen) via `@msqdx/ui` `InspectSection` (+ `ChatKeyValueList` / `Chip` / `Badge` as appropriate).
3. WHEN secondary facts exist (Setting, Komposition, Beobachtung, Safety, Mood) THEN they MUST live under `ChatCollapsible` — not a flat wall of custom headings.
4. WHEN scenes inspect chrome is composed THEN it MUST use `ScrollArea` + `Stack` + `InspectSection` (and related chat/inspect primitives) — NOT app-local `videon-scene-insight__section` / brand-badge clones. Evidence frame thumbnails MAY remain app-local (`TimelineClipThumbnail`).
5. WHERE no scene is selected or analysis is empty THEN the pane MUST use `EmptyState` / `Text` empty copy, not an empty scroll.
6. WHEN Personen/Objekte/Aktionen render in the drawer THEN they MUST use dense chip/row chrome (`videon-scene-inspect__entity`) with a leading brand-accent icon by kind (person / text / vehicle / product / animal / prop / action) — NOT `ChatEntityGrid` / `EntityCard` (catalog min-height is wrong for a narrow inspect rail).
7. WHEN Brand findings exist THEN the Brand section MUST surface status counts, guideline/request ids, reason/hint, evidence thumbs + timestamps, per-frame statuses when stored, Vision `brandCandidates`, measured Brandion observations when stored, and rule **plus token-coverage** findings (severity + message + subject→target) — not only a single `pass` chip and an evidence count. Token coverage MUST be merged like Brandion `FindingsWorkspace` (`tokenCoverage` → findings).
8. WHEN secondary facts use `ChatCollapsible` in the scenes drawer THEN it MUST use `density="compact"` (sm trigger + padded chrome) — not the flush chat default / `title xl` trigger.
9. WHEN InspectSection titles render in the scenes drawer THEN they MUST use full `--fg` color (not muted grey).
10. WHEN Setting / Komposition key-value rows render THEN each row MUST include a leading brand-accent icon via `ChatKeyValueItem.icon` (Ort/Map, Tageszeit/Clock, Umgebung/Image, Details/Scroll, Shot/Video, Kamera/Camera, Farben/Fill).

## Editor chrome (DS consistency)

1. WHEN toolbar overflow is needed THEN it MUST use `useFlyout` + `Button` + `ds-flyover` (app helper `EditorOverflowMenu`) — NOT native `<details>`/`<summary>`.
2. WHEN a form control is shown in the editor THEN it MUST use `Field` + `Select`/`Input` — NOT native OS `<select>`.
3. WHEN a control is an icon tool THEN it MUST use `ToolButton`; text actions MUST use `Button` (ghost/sm or primary).
4. `ContextMenu` is for pointer-positioned menus only — not toolbar overflow.
5. WHEN the operator right-clicks the source timeline THEN the editor MUST open `@msqdx/ui` `ContextMenu` per `timeline-context-menu.md` — NOT the browser default menu and NOT a Flyout.

## Editor layout

1. WHEN the NLE shell renders THEN it MUST use exactly three grid rows (top chrome · program · timeline). Drawer/shortcuts MUST NOT participate in the grid (overlay layer).
2. WHEN the timeline dock renders THEN it MUST size to its track stack (`auto`) and MUST NOT clip with a vertical scrollbar; horizontal overflow for zoom/scrub is allowed.
3. WHEN scene/transcript clips render on a source timeline THEN visible labels MUST be truncated; full text stays in `title` / Inspect.
4. WHEN V1 or A1 mute is toggled AND no stem streams are available THEN the program `<video>` MUST set `muted` (`programAudioMuted`); mute MUST NOT be visual-only.
5. WHEN voice/music stems exist THEN the program monitor MUST play stem streams (`/stems/{voice|music}/stream`) synced to the video clock; the `<video>` audio bus MUST stay muted (split-out original). A1/A2 mute MUST mute only the matching stem — never silence sibling stems via `video.muted`.
6. WHEN stem separation runs without Demucs THEN it MUST use center-band approximation (`ffmpeg_center_band`), not raw mid/side as \"voice\". True Voice/Music REQUIRES Demucs — see `knowledge/stem-separation.md`.
7. WHEN voice/music stems exist THEN the editor MUST offer a download of each stem WAV (`/stems/{voice|music}/stream?download=1`) so operators can inspect A1/A2 offline (debug / share).
8. WHEN the program monitor renders THEN its frame MUST be **height-first**: size with `aspect-ratio: 16 / 9` using `min(available height, available width × 9/16)` — NOT stretch to ultrawide width. The video MUST stay fully visible (`object-fit: contain`, centered).
9. WHEN the program/source monitor plays THEN it MUST NOT burn scene insight summary or scene timing onto the picture (Inspect drawer / SI track own that narrative). In/Out mark readout on the monitor MAY remain while marks are set.
10. WHEN Light theme is active THEN editor chrome MUST use brand paper tokens (`--bg0` / `--bg1`, e.g. `#f8f6f0`) — NOT `color-mix(..., black)` washes that turn the stage gray.

## Timeline DS shell (Wave C)

1. WHEN the cut timeline renders ticks THEN it MUST compose `TimelineRuler` (percent offsets); seek/trim math MAY stay pixel-based in app code.
2. WHEN video/transcript/audio clips render THEN they MUST use `TimelineClip` (and `Waveform` for audio peaks) — edit handlers stay app-local.
3. `TimelineTrack` dual-column chrome is optional while VIDEON keeps the two-column header + lanes layout.
4. WHEN timeline clips/lanes support authoring actions THEN right-click MUST use `ContextMenu` (`timeline-context-menu.md`).

## Acceptance

- Hub titles use `Text` / `SectionChrome`, not `.videon-spread__*`.
- No MUI / `@msqdx/react`.
- Paths only via `lib/paths.ts` / `runtime-config.ts`.
- Editor drawer uses `InspectTabs`; timeline shell uses `TimelineRuler` / `TimelineClip` / `Waveform`.
- Scenes inspect: truncated navigator + `InspectSection` / `ChatCollapsible` detail (Wave D).
- Toolbar overflow uses Flyout pattern; editor selects use `Select`.
- Timeline right-click uses `ContextMenu` (`timeline-context-menu.md`).
