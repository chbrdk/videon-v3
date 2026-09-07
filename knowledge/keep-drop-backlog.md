# Keep / reshape / drop — VIDEON UI

**Status:** Living — 2026-09-07  
**Companion:** `knowledge/ui-rebuild-reuse.md`

| Surface | Decision | Notes |
|---------|----------|-------|
| AppShell + Product-Switcher | **Keep** | Compose `AppFrame` / `NavRail` / `BrandCornerProductMenu` |
| Home magazine spine | **Reshape** | Layout app-local; tiles → `HubIndexCard`; titles → `Text` |
| Collection / media / cuts lists | **Reshape** | Media browse → native `Card` + `CardActions`; hubs → `HubIndexCard`; dense rows → `RankedList` |
| `EntityCard` in Mediathek | **Drop** | Brandion catalog chrome — wrong for media browse |
| Analyses pipeline UI | **Reshape** | `StepStrip` + `Chip` / `StatusDot` / `Meter` |
| Settings stub | **Reshape** | `SettingsShell` / `SettingsBand` |
| Native search inputs | **Drop** | `Field` + `Input` |
| File picker upload | **Keep** app-local | Brandion pattern — no DS FileDrop this wave |
| NLE edit logic / waveform data | **Keep** app-domain | |
| NLE tool / transport / monitor chrome | **Reshape** | Promote to `msqdx-ui` primitives |
| Native `<details>` “Mehr”-Menü | **Drop** | `useFlyout` + `Button` + `ds-flyover` (`EditorOverflowMenu`) |
| Native `<select>` in Editor | **Drop** | `Field` + `Select` |
| `ToolButton` mit Text-Label (Bin/Inspect) | **Drop** | `Button` ghost/sm — `ToolButton` nur Icon |
| `ContextMenu` für Toolbar-Overflow | **Drop** | ContextMenu = Rechtsklick; Toolbar = Flyout |
| Parallel NLE hex palette | **Drop** | Map to theme tokens |
| PlatformAssistantHost | **Defer** | Out of scope for this rebuild |

## Waves

1. Hubs + barrels  
2. DS NLE primitives (`ToolButton`, `Timecode`, `TransportBar`, `MediaMonitor`, `Timeline*`, `Waveform`)  
3. Editor wire-up + token unify  
4. **Wave B (done):** Editor IA — `InspectTabs` drawer, status strip, Toast, quieter toolbar  
5. **Wave C (done):** Timeline DS shell — `TimelineRuler` / `TimelineClip` / `Waveform` without rewriting edit math  
6. **Deferred:** Mediathek browse polish (Wave A) — not editor-critical  
7. **Wave A (in progress):** Mediathek Browse — thumbs, duration, FilterRow, analysis status  
