# Cut change watch (Wave P5)

**Status:** **PAUSED** ≥ panel **0.1.35** (`ENABLE_INPLACE_PATCH = false`)  
**Strategy:** `knowledge/adobe-uxp-provider-first.md`  
**Updated:** 2026-09-10  
**Spec:** `specs/domain/adobe-uxp-cut-pushback-premiere.md` § Wave P5

## Why paused

Depends on in-place Cut→Premiere patch (P4), which does not reliably handle moves/deletes. Settings are disabled in the panel while the gate is off.

## Prior idea (for revival)

While Cuts mode is open, poll Cut `updatedAt` vs link `syncedUpdatedAt` (~8s). Badge/banner only by default; optional Auto-Patch mutated via in-place path.

## Operator path now

After editing a Cut in Videon, use **Cut neu laden** when Premiere should match (honest ZIP replace).
