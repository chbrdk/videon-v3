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

## Surfaces

| Route | Role | DS composition |
|-------|------|----------------|
| `/` | Home magazine | Cover + `HubIndexCard` capabilities + activity columns |
| `/collections` | Access Model B picker | `HubIndexCard` grid |
| `/library` | Media hub | Header + `Input` search + cards/list + browse filters |

## Mediathek browse (Wave A)

1. WHEN the media list loads THEN each item MUST expose `durationMs` and `latestAnalysisStatus` for card/list chrome.
2. WHEN the card layout is active THEN cards MUST use native `@msqdx/ui` `Card` (+ `CardActions`) with media/title/meta slots — NOT `EntityCard` (catalog) and NOT `HubIndexCard` (magazine headlines).
3. WHEN filters are shown THEN they MUST use `FilterRow` + `Chip` for lifecycle and analysis facets.
4. WHEN item status is shown on browse cards/list THEN it MUST use toned `@msqdx/ui` `Badge` (lifecycle + analysis) — NOT uncolored static `Chip`s and NOT a lone green `StatusDot` for “keine Analyse”.
5. WHERE quick actions appear THEN they MUST link to open / analyses / cuts without nesting interactive controls inside the card anchor.
| `/upload` | Ingest | `Field` + native file input + `Button` |
| `/analyses` | Vision runs | `StepStrip` / `Meter` / `Chip` rows |
| `/cuts` | Cut index | `HubIndexCard` / `RankedList` |
| `/settings` | Runtime | `SettingsShell` |
| `/media/:id`, `/cuts/:id` | NLE | `MediaMonitor`, `TransportBar`, `Timeline*`, `FloatingPanel` / `InspectTabs`, `Toast` |

## Editor IA (Wave B)

1. WHEN the side drawer is open THEN it MUST use `InspectTabs` for panel switching (scenes / transcript / search / pipeline / bin).
2. WHEN the side drawer is open THEN its width MUST be user-resizable (drag handle on the leading edge) and SHOULD persist in `sessionStorage` (`videon.editor.drawerWidthPx`).
3. WHEN analysis or export status is visible THEN the editor MUST show `EditorStatusStrip` (StatusDot + Text), not a second toolbar row of ad-hoc notices.
4. WHEN a non-fatal action succeeds or fails THEN feedback MUST go through `Toast` (`ToastProvider` in app providers). Fatal empty-state errors MAY remain inline.
5. WHILE the toolbar stays dense, primary edit/export actions MUST stay visible; secondary actions (download, archive, stems, brand) MUST live under a “Mehr” disclosure.
6. WHEN the pipeline panel is shown in the drawer THEN `PipelineStatusTrack` MUST use `StepStrip orientation="vertical"` — not a horizontal scroller of stage cards.

## Scenes inspect (Wave D)

1. WHEN the scenes tab lists analysed scenes THEN each navigator row MUST show a **truncated** label (≈72 chars via `timelineClipLabel`), a `Timecode` range, and an optional Brand status (`StatusDot` + `Chip`/`Badge`) — NOT the full `insight.summary` as the row title.
2. WHEN a scene is selected THEN the detail pane MUST show the full summary once as `Text` body, then primary facts (Brand, Personen, Objekte, Aktionen) via `@msqdx/ui` `InspectSection` (+ `ChatKeyValueList` / `Chip` / `Badge` as appropriate).
3. WHEN secondary facts exist (Setting, Komposition, Brand-Hinweise, Beobachtung, Safety, Mood) THEN they MUST live under `ChatCollapsible` — not a flat wall of custom headings.
4. WHEN scenes inspect chrome is composed THEN it MUST use `ScrollArea` + `Stack` + `InspectSection` (and related chat/inspect primitives) — NOT app-local `videon-scene-insight__section` / brand-badge clones. Evidence frame thumbnails MAY remain app-local (`TimelineClipThumbnail`).
5. WHERE no scene is selected or analysis is empty THEN the pane MUST use `EmptyState` / `Text` empty copy, not an empty scroll.

## Editor chrome (DS consistency)

1. WHEN toolbar overflow is needed THEN it MUST use `useFlyout` + `Button` + `ds-flyover` (app helper `EditorOverflowMenu`) — NOT native `<details>`/`<summary>`.
2. WHEN a form control is shown in the editor THEN it MUST use `Field` + `Select`/`Input` — NOT native OS `<select>`.
3. WHEN a control is an icon tool THEN it MUST use `ToolButton`; text actions MUST use `Button` (ghost/sm or primary).
4. `ContextMenu` is for pointer-positioned menus only — not toolbar overflow.

## Editor layout

1. WHEN the NLE shell renders THEN it MUST use exactly three grid rows (top chrome · program · timeline). Drawer/shortcuts MUST NOT participate in the grid (overlay layer).
2. WHEN the timeline dock renders THEN it MUST size to its track stack (`auto`) and MUST NOT clip with a vertical scrollbar; horizontal overflow for zoom/scrub is allowed.
3. WHEN scene/transcript clips render on a source timeline THEN visible labels MUST be truncated; full text stays in `title` / Inspect.
4. WHEN V1 or A1 mute is toggled AND no stem streams are available THEN the program `<video>` MUST set `muted` (`programAudioMuted`); mute MUST NOT be visual-only.
5. WHEN voice/music stems exist THEN the program monitor MUST play stem streams (`/stems/{voice|music}/stream`) synced to the video clock; the `<video>` audio bus MUST stay muted (split-out original). A1/A2 mute MUST mute only the matching stem — never silence sibling stems via `video.muted`.
6. WHEN stem separation runs without Demucs THEN it MUST use center-band approximation (`ffmpeg_center_band`), not raw mid/side as \"voice\". True Voice/Music REQUIRES Demucs — see `knowledge/stem-separation.md`.

## Timeline DS shell (Wave C)

1. WHEN the cut timeline renders ticks THEN it MUST compose `TimelineRuler` (percent offsets); seek/trim math MAY stay pixel-based in app code.
2. WHEN video/transcript/audio clips render THEN they MUST use `TimelineClip` (and `Waveform` for audio peaks) — edit handlers stay app-local.
3. `TimelineTrack` dual-column chrome is optional while VIDEON keeps the two-column header + lanes layout.

## Acceptance

- Hub titles use `Text` / `SectionChrome`, not `.videon-spread__*`.
- No MUI / `@msqdx/react`.
- Paths only via `lib/paths.ts` / `runtime-config.ts`.
- Editor drawer uses `InspectTabs`; timeline shell uses `TimelineRuler` / `TimelineClip` / `Waveform`.
- Scenes inspect: truncated navigator + `InspectSection` / `ChatCollapsible` detail (Wave D).
- Toolbar overflow uses Flyout pattern; editor selects use `Select`.
