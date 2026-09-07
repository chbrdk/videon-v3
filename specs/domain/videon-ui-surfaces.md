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
2. WHEN the card layout is active THEN cards MUST use `EntityCard` (catalog density), not `HubIndexCard` magazine headlines — preview thumb dominant, filename as compact title, lifecycle/analysis chips, and duration when known.
3. WHEN filters are shown THEN they MUST use `FilterRow` + `Chip` for lifecycle and analysis facets.
4. WHERE quick actions appear THEN they MUST link to open / analyses / cuts without nesting interactive controls inside the card anchor.
| `/upload` | Ingest | `Field` + native file input + `Button` |
| `/analyses` | Vision runs | `StepStrip` / `Meter` / `Chip` rows |
| `/cuts` | Cut index | `HubIndexCard` / `RankedList` |
| `/settings` | Runtime | `SettingsShell` |
| `/media/:id`, `/cuts/:id` | NLE | `MediaMonitor`, `TransportBar`, `Timeline*`, `FloatingPanel` / `InspectTabs`, `Toast` |

## Editor IA (Wave B)

1. WHEN the side drawer is open THEN it MUST use `InspectTabs` for panel switching (scenes / transcript / search / pipeline / bin).
2. WHEN analysis or export status is visible THEN the editor MUST show `EditorStatusStrip` (StatusDot + Text), not a second toolbar row of ad-hoc notices.
3. WHEN a non-fatal action succeeds or fails THEN feedback MUST go through `Toast` (`ToastProvider` in app providers). Fatal empty-state errors MAY remain inline.
4. WHILE the toolbar stays dense, primary edit/export actions MUST stay visible; secondary actions (download, archive, stems, brand) MUST live under a “Mehr” disclosure.

## Editor layout

1. WHEN the NLE shell renders THEN it MUST use exactly three grid rows (top chrome · program · timeline). Drawer/shortcuts MUST NOT participate in the grid (overlay layer).
2. WHEN scene/transcript clips render on a source timeline THEN visible labels MUST be truncated; full text stays in `title` / Inspect.


1. WHEN the cut timeline renders ticks THEN it MUST compose `TimelineRuler` (percent offsets); seek/trim math MAY stay pixel-based in app code.
2. WHEN video/transcript/audio clips render THEN they MUST use `TimelineClip` (and `Waveform` for audio peaks) — edit handlers stay app-local.
3. `TimelineTrack` dual-column chrome is optional while VIDEON keeps the two-column header + lanes layout.

## Acceptance

- Hub titles use `Text` / `SectionChrome`, not `.videon-spread__*`.
- No MUI / `@msqdx/react`.
- Paths only via `lib/paths.ts` / `runtime-config.ts`.
- Editor drawer uses `InspectTabs`; timeline shell uses `TimelineRuler` / `TimelineClip` / `Waveform`.
