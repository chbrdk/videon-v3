# UI rebuild — reuse from `@msqdx/ui`

**Status:** Living — 2026-09-07  
**Companion:** `specs/domain/videon-ui-surfaces.md`, `knowledge/keep-drop-backlog.md`

VIDEON v3 must **compose** shared chrome, not fork a second design language.

## Import from `@msqdx/ui` (always)

| Need | Export |
|------|--------|
| Shell | `AppFrame`, `NavRail`, `BrandCorner*`, `ShellBackButton`, `MsqdxLogoMark`, `shellFrameStyle` |
| Magazine / hub | `SectionChrome`, `Panel`, `Text`, `Lede`, `HubIndexCard`, `HubIndexLayoutSwitch`, `AddTile`, `RankedList` |
| Browse tiles | `Card` + `CardActions` (media/title/meta slots) — not `EntityCard` / not magazine `HubIndexCard` |
| Forms | `Field`, `Input`, `Select`, `ToggleGroup`, `Checkbox` |
| Actions / feedback | `Button`, `Chip`, `Alert`, `Dialog`, `Spinner`, `EmptyState`, `LoadingText`, `StatusDot`, `Meter`, `Toast` / `useToast` |
| Pipeline chrome | `StepStrip`, `StepStripItem` |
| Settings | `SettingsShell`, `SettingsBand` |
| Editor chrome (DS) | `ToolButton` (icon), `Timecode`, `TransportBar`, `MediaMonitor`, `TimelineRuler`, `TimelineTrack`, `TimelineClip`, `Waveform`, `InspectTabs` |
| Toolbar overflow | `useFlyout` + `Button` + `ds-flyover` (app: `EditorOverflowMenu`) — not native `<details>` |
| Forms in editor | `Field` + `Select` — not native `<select>` |
| Overlays | `FloatingPanel`, `Flyout`, `InspectSection`, `InspectTabs`, `ContextMenu` (pointer menus only) |

App barrels: `apps/web/lib/msqdx-ui.ts`, `msqdx-ui-shell.ts`, `msqdx-ui-client.ts`.

Editor status strip is app-local (`EditorStatusStrip`) composing `StatusDot` + `Text`.

## Mirror from Audion / Checkion (pattern, not npm import)

| Pattern | Use in VIDEON |
|---------|---------------|
| Hub index cards/list | Collections, Mediathek, Cuts |
| Magazine home spine | Home cover → capability tiles → activity |
| SettingsShell | Settings stub → real bands |
| Pipeline as StepStrip/Meter | Analyses list / pipeline track |

## Do not

- Invent local Button / Panel / Card / Chip clones.
- Keep `.videon-spread__*` titles when `Text` / `SectionChrome` suffice.
- Missuse `CanvasViewport` / `ChannelStack` / `StepStrip` as NLE timeline replacements.
- Promote Collection-/Cut-domain logic into `msqdx-ui`.
- Reintroduce MUI or `@msqdx/react`.
