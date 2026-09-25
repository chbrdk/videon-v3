# Adobe UXP panel — MSQ DX visual language

**Status:** Active — panel ≥ **0.1.46**  
**Spec:** `specs/domain/adobe-uxp-library-panel.md` § Panel UX  
**Constraint:** Do **not** bundle React `@msqdx/ui` into UXP. Snapshot tokens + **`ds-*` component CSS mirror**.

## UXP host chrome (critical)

Premiere UXP styles native `<button>` with Spectrum (orange focus rings, grey fills). CSS `!important` does **not** reliably win. Panel controls are `div[role="button"]` with class `ds-btn` (+ Enter/Space key bind). Do not reintroduce `<button>` for chrome.

## UXP layout (critical)

Adobe UXP **does not support flex/grid `gap`**. Spacing MUST use margins (`margin` on children, or `#app > * + *` / `.results-list` negative-margin + `.hit-card { margin }`). Using `gap` alone looks fine in browser preview and fails in Premiere (cards glued together).

## Branding (panel)

Panel header uses an **inline brand lockup** (orange MSQ mark `#ff6a3b` + **VIDEON** + Library/version) — not the AppFrame ink BrandCorner plaque (white box reads as a floating “X” in the narrow panel). Full BrandCorner cutdown stays for web shells.

## UXP CSS load (critical)

Adobe UXP **does not apply CSS `@import`**. Tokens/components linked only via `@import` in `styles.css` never load.

| Rule | Detail |
|------|--------|
| Ship | `src/styles.bundle.css` — `build.cjs` concatenates `msqdx-tokens.css` + `msqdx-components.css` + `styles.css` |
| Link | `index.html` → `src/styles.bundle.css` (plugin-root-relative) |
| Edit | Sources above; run `npm run build` so the bundle refreshes |
| Logo | Inline SVG paths use hard fill `#ff6a3b` |
| Controls | `div[role="button"].ds-btn` — primary fill `#ff6a3b`, ghost hairline, no Spectrum rings |
| Spacing | Margins only — never rely on `gap` for UXP layout |

## Snapshot (2026-09-10)

| Panel file | Source |
|------------|--------|
| `src/msqdx-tokens.css` | `msqdx-ui/.../css/tokens.css` theme `msqdx-ui-dark` |
| `src/msqdx-components.css` | Mirror of Button, Field, Input, Chip, Badge, Alert, Panel, FormSection, Card, CardActions, Checkbox (`ds-*` classes) |
| `src/styles.bundle.css` | Build output — **what Premiere loads** |
| `src/assets/msqdx-mark.svg` | `MsqdxLogoMark.tsx` paths (also inlined in header) |

Re-sync when DS CSS changes; keep panel CSS thin. Prefer matching public class names over inventing parallel BEM.

## Mirrored primitives (UXP)

| DS component | Panel classes |
|--------------|---------------|
| Button | `div[role=button].ds-btn ds-btn--primary\|ghost --sm\|md --square` |
| Field / Input | `ds-field` + `ds-field-label` + `ds-input` / `search-input` |
| Select | Native `<select class="ds-input">` (listbox too heavy for UXP) |
| Chip | `ds-chip` (mode tabs when Cuts revived) |
| Badge | `ds-badge --accent\|neutral\|…` (soft fill, no hard orange outline) |
| Alert | `ds-alert` + `panel-banner` box for density |
| Panel / FormSection | `ds-panel--card\|default`, `ds-form-section` |
| Card / CardActions | Hit cards: `ds-card--media` + `ds-card-actions--hairline` |
| Brand | Inline `.brand-lockup` (mark + VIDEON) — not AppFrame BrandCorner plaque |

## Not ported

- React `@msqdx/ui` package
- Wave icons / Lucide
- Custom Select listbox / BrandCorner product menu / AppFrame fixed ink corners
- `color-mix()` (solid rgba fallbacks)
- Native HTML `<button>` (Spectrum host conflict)
- Flex/grid `gap` (use margins)

## Branding notes

- Header left: orange mark + **VIDEON** + Library/version; settings ghost on the right
- Accent `#ff6a3b` on primary CTAs
- Hit cards: `margin: 0.55rem` gutters; body items use bottom margins (not `gap`)
- Compact `ds-btn--xs` on cards; **Anzeigen** → detail overlay (`knowledge/adobe-uxp-hit-detail-overlay.md`)
