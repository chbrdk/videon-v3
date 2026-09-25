# Open Cut — In-place Premiere patch (Wave P4)

**Status:** **PAUSED** ≥ panel **0.1.35** (`ENABLE_INPLACE_PATCH = false`)  
**Strategy:** `knowledge/adobe-uxp-provider-first.md`  
**Updated:** 2026-09-10  
**Spec:** `specs/domain/adobe-uxp-cut-pushback-premiere.md` § Wave P4

## Why paused

Repeated Cut moves scramble Premiere positions; deletes do not sync reliably; UXP timing APIs throw `Invalid Parameter`. Product focus shifts to **best clip/Cut provider** into Premiere, not live timeline parity.

## Operator path now

Use **Cut neu laden** (explicit ZIP replace). Code for in-place patch remains in `premiere-patch-cut.js` / `clip-match.js` for a later revisit.

## Prior design (for revival)

Do **not** rebuild the Premiere sequence on every Cut → Premiere refresh. Update **timing only** on live track items so Premiere-native effects stay.

### Match stack (P4.2)

Module: `tools/adobe-uxp-library-panel/src/clip-match.js`

| Priority | Signal | Weight |
|----------|--------|--------|
| 1 | Scene id in name (`⟦uuid⟧`, `[uuid]`, `//MD:…`, `videon:scene:`) | 1000 |
| 2 | `mediaAssetId` from media path / `file-{uuid}` / cache `…/media/{uuid}/` | 400 |
| 3 | Filename / stem | 200 / 120 |
| 4 | Timeline start proximity | 90 → 18 |
| 5 | Source in-point + duration proximity | 50 → 8 |
| 6 | Same index / equal-count order fill | weak |

### Audio follows video (P4.3 / P4.4)

1. Pure slide → `createMoveAction` on video (linked audio usually follows).
2. Trim / bounds → `setEnd` then `setStart`; In/Out soft-fail.
3. Stamp scene ids on audio names.

**0.1.34:** Caught `Invalid Parameter`; prefer move for slides.
