# Media insights publish (Collection Knowledge Pack)

**Status:** Accepted — 2026-09-08  
**Product:** VIDEON v3  
**Facet:** `media_insights`  
**Plexon SoT:** `plexon-v3/specs/domain/collection-knowledge-pack.md` · `plexon-v3/specs/domain/videon-integration.md` § Knowledge Pack  
**Implements:** `apps/web/lib/plexon-knowledge-pack.ts` · `apps/web/lib/media-insights-publish.ts`

## Purpose

After a successful media analysis, VIDEON distills a **bounded** Collection-scoped summary (highlights + scene deep links + media count) and publishes it to the shared Knowledge Pack facet `media_insights`. Soft / fire-and-forget — analysis MUST NOT fail when Plexon is down.

## Guarantees

1. WHEN analysis finishes `succeeded` THEN VIDEON MAY schedule a soft publish (no throw into the pipeline).  
2. WHEN publishing THEN payload MUST respect pack caps (summary ≤ ~2k, highlights ≤ 12, sceneRefs ≤ 20, no raw video / transcripts / signed URLs).  
3. WHEN Collection / distillate / pack is unavailable THEN soft skip + log — NOT a hard error.

## Acceptance

1. Client uses federation contract headers + service secret against Plexon knowledge facet publish.  
2. Hook lives in `run-analysis.ts` after `markAnalysisFinished(..., 'succeeded')`.
