# Pushback — Effects / transitions round-trip (Wave P3)

**Status:** Product-required backlog (not shipped)  
**Updated:** 2026-09-10  
**Spec:** `specs/domain/adobe-uxp-cut-pushback-premiere.md` § Wave P3  
**Panel today:** ≥ **0.1.26** warns; does **not** preserve effects

## Operator reality (now)

1. Apply effect in Premiere on a linked sequence.  
2. **Cut aktualisieren → Übernehmen** → Cut gets clips/times only (`ignored: effects`).  
3. **Premiere aktualisieren** / **Sequenz ersetzen** → fresh Cut ZIP → **effects gone**.

Until P3: keep finishing effects in Premiere **after** last Cut sync, or avoid round-trip once effects are on.

## Required outcome (P3)

Effects/transitions on mapped V1 clips MUST survive:

`Premiere (with FX) → Cut aktualisieren → Premiere aktualisieren`

without the operator re-applying FX.

## Spike questions

1. Which Premiere effect classes survive XMEML export/import vs need host API?  
2. Sidecar on `cut_scenes` vs opaque blob in export package?  
3. How to re-attach when clip `id`s are rewritten on restore?  
4. Transitions between clips vs clip effects — same store or separate?

## Related

- Diff already flags `effects` / `transitions` (`xmeml-pushback.js`)  
- Warning copy: `formatEffectsLossWarning`  
- Playback/mapping harden: `knowledge/adobe-uxp-pushback-restore-playback.md`
