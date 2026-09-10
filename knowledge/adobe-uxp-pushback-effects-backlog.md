# Pushback — Clip effects sidecar (Wave P3.0)

**Status:** Shipped panel ≥ **0.1.27** + migration `0018_cut_scenes_premiere_filters.sql`  
**Updated:** 2026-09-10  
**Spec:** `specs/domain/adobe-uxp-cut-pushback-premiere.md` § Wave P3

## Product rule

Clip effects MUST stay in Cut **data** through round-trip. They are **not** shown in the Videon Cut UI.

## Flow

1. Premiere → Cut: parse each V1 `clipitem`’s `<filter>…</filter>` → `cut_scenes.premiere_filters_xml`  
2. Cut → Premiere: `buildPremiereXmeml` re-injects that XML into the matching clipitem  
3. No loss warnings in the panel for clip effects

## Limits

- **Clip filters** only (what Premiere puts under `<filter>` in XMEML).  
- **Transitions** between clips: not stored yet.  
- Third-party / non-XML effects may not appear in XMEML capture — then nothing to store.  
- Premiere must re-accept the re-injected filters on import (native Premiere FX usually do).

## Files

- Migration: `migrations/0018_cut_scenes_premiere_filters.sql`  
- Sanitize: `apps/web/lib/pipeline/premiere-filters-xml.ts`  
- Panel: `xmeml-pushback.js` `extractPremiereFilterBlocks`  
- Export: `export-premiere-xml.ts` injects `premiereFiltersXml`
