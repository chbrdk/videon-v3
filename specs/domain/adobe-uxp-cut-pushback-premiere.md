# Adobe UXP — Update Cut from Premiere (pushback sketch)

**Status:** Draft — 2026-09-10 (manual parity **P1/P2 panel MVP ≥ 0.1.22** — V1 restore; host XML export ≥ 26.2 or file pick; V2/VO apply later)  
**Product:** VIDEON v3  
**Federation:** `2026-05-plexon-federation-v3`  
**Companions:**  
- `specs/domain/adobe-uxp-open-cut-premiere.md` (Cut → Premiere; **outbound** remains primary)  
- `specs/domain/cut-export-extras.md` (XMEML outbound SSOT)  
- `specs/domain/cut-multi-track.md` (V1 / V2 / VO model)  
- `specs/domain/cut-multi-source-compose.md` · `specs/api/cuts.md`  
**Knowledge:** `knowledge/paths.md` · `knowledge/adobe-uxp-cut-pushback-premiere.md`  
**Implements:** `tools/adobe-uxp-library-panel/` — `cut-pushback.js` · `xmeml-pushback.js` · `premiere-capture.js` · `cut-link-store.js` (panel ≥ 0.1.22)

## Purpose

Achieve **manual timeline parity** between a Collection **Cut** and its linked **Premiere sequence**: after an explicit operator action, the mapped editorial state in VIDEON equals Premiere and the reverse — within a defined track scope.

Triggers are **buttons**, never background watchers:

| Action (panel) | Direction | Resulting SSOT for mapped scope |
|----------------|-----------|----------------------------------|
| **In Premiere öffnen** / **Premiere aktualisieren** | Cut → Premiere | Premiere sequence matches Cut |
| **Cut aktualisieren** | Premiere → Cut | Cut matches Premiere (mapped clips); then optionally refresh Premiere so both match the clean Cut |

This is **not** live sync. It is **on-demand round-trip parity**.

## Product principle (locked)

1. Manual trigger is enough — no continuous sync.
2. WHEN a sync action reports success THEN mapped V1 (/ V2 / VO) timeline state MUST be equivalent on both sides (same media assets, source in/out, order, timeline placement within tolerance).
3. WHEN Premiere contains features outside the Cut model THEN the UI MUST either (a) list them as dropped and require confirm before Cut apply, and/or (b) offer **Premiere aus Cut neu laden** so the NLE is brought back to Cut truth (parity by discarding unsupported NLE-only work).
4. “Gleich” means **Cut-model equality**, not pixel-identical Premiere project (no promise to preserve transitions/effects).

## Problem

Open Cut lands editorial intent in Premiere. Finishing continues in the NLE. Without a reverse path and a clear re-open path, Cut and sequence diverge and neither side is trustworthy for Collection workflows.

## Relationship (both directions)

| Direction | Spec / action | Trigger | After success (mapped scope) |
|-----------|---------------|---------|------------------------------|
| Cut → Premiere | `adobe-uxp-open-cut-premiere.md` | **In Premiere öffnen** / **Premiere aktualisieren** | Premiere ≡ Cut |
| Premiere → Cut | **This sketch** | **Cut aktualisieren** | Cut ≡ Premiere (mapped); unsupported dropped with confirm |
| Reconcile NLE | Open Cut again after apply | **Premiere aus Cut neu laden** | Premiere ≡ Cut again (clean package) |

Recommended UX after successful pushback: primary CTA **Premiere aus Cut neu laden** so both sides share the same clean artifact (outbound ZIP), not a half-migrated sequence with leftover effects.

## Non-goals (hard)

- Live / background / continuous sync while editing.
- Claiming full Premiere project identity (effects, transitions, nests, titles, …).
- Silent overwrite without diff + confirm when anything would be dropped or remapped.
- Treating arbitrary Premiere projects as Cuts (only sequences linkable to Collection media).
- Creating a new Cut from a random sequence in P0 (optional later — “Save as new Cut”).
- AE / FCP / Resolve.
- Using pushback as the only Cut editor for daily VIDEON work.
- Shipping a parser that claims parity when required clips are unmapped.

## Honesty ladder

| Mode | When | Behavior |
|------|------|----------|
| **`preview_diff`** | Default first step | Parse → mapped delta + **unsupported** leftovers; no write |
| **`apply_replace`** | Operator confirms (incl. drops) | Cut timeline in scope replaced; `updatedAt` advances |
| **`parity_refresh`** | After apply, or standalone | Re-run outbound Open Cut / replace sequence from fresh `premiere_xml` so Premiere ≡ Cut |
| **`apply_rejected`** | Unmapped required media, empty parse, host failure | No Cut mutation |
| **`unsupported`** | Wrong host / no sequence / no link | Fail closed |

MUST NOT report success as “Premiere = VIDEON” if required V1 mapping failed or if unsupported leftovers remain **and** the operator did not confirm drops / did not refresh Premiere.

Parity claim language (DE, locked for UX):

- After Cut → Premiere: `Premiere entspricht dem Cut (V1[/V2/VO]).`
- After Premiere → Cut (no leftovers): `Cut entspricht der Sequenz.`
- After Premiere → Cut (with drops) + refresh: `Cut aktualisiert. Premiere neu geladen — beide Seiten gleich (Cut-Modell).`
- After Premiere → Cut (with drops) without refresh: `Cut aktualisiert. Premiere enthält noch nicht übernommene Elemente — „Premiere aus Cut neu laden“ für Gleichstand.`

## Operator story (target)

1. Link exists from prior **In Premiere öffnen** (see Linking).
2. Operator edits in Premiere **or** in the Cut editor.
3. To align:
   - NLE ahead → **Cut aktualisieren** → diff → confirm → optional **Premiere aus Cut neu laden**.
   - Cut ahead → **Premiere aktualisieren** (same as Open Cut refresh / replace linked sequence).
4. Banner states which parity mode applied (see claim language above).

“Gleich” after a full happy path (pushback + refresh, or outbound refresh alone) means both UIs show the same mapped timeline.

## Linking (Cut ↔ sequence)

Without a stable link, pushback is guesswork.

**Wave P0 (required before apply):**

1. When Open Cut succeeds, panel stores a local link record:  
   `{ cutId, platformProjectId, sequenceName?, openedAt, exportId? }` in UXP prefs / data folder.
2. Pushback prefers the **active sequence** only if it matches the linked name (or operator picks from a short list of sequences).
3. If no link / mismatch → operator must **choose Cut** + confirm “active sequence → this Cut” (extra friction, allowed).

**Out of scope P0:** writing custom metadata into the Premiere project file; cloud-side link table (MAY add later under Collection).

## Capture (how we read Premiere)

Ordered preference (spike to lock one):

1. **Host export** — if UXP/`premierepro` can export active sequence to XMEML (or FCPXML that we already refuse — prefer XMEML) to a temp path under plugin data.
2. **ExtendScript / menu bridge** — only if (1) missing; must be explicit and version-gated.
3. **Operator file pick** — last resort: user selects an XML they exported via File → Export; panel parses that file (still confirm + diff).

MUST NOT scrape the timeline solely via brittle SequenceEditor walk as the sole SSOT for apply (walk MAY assist diff UX).

## Mapping scope (what can become Cut truth)

Aligned with `cut-multi-track.md` / outbound XMEML:

| Premiere (from our export vocabulary) | Cut target | P0 |
|---------------------------------------|------------|----|
| Video track `V1` clipitems | `cut_scenes` (media + source in/out + timeline order/start) | **Yes** |
| Video track `V2` clipitems | `cut_video_clips` on overlay track | **Yes** if present |
| Audio `VO` / bus pair | `cut_audio_clips` on `audio_bus` | **Yes** if present |
| Linked V1 stereo under V1 | Derived / ignored on pushback (Cut derives stems from media) | Ignore |
| Transitions, effects, titles, nests | — | **Drop** (list in diff) |
| Unknown track names | — | **Drop** or reject apply if they hold the only clips |

### Media identity

Each clipitem MUST resolve to a workspace `mediaAssetId` via:

1. Path basename / cache path match against Collection media, or  
2. Stable id embedded in outbound XMEML **if we add one in a future export wave** (recommended before P1 apply), or  
3. Fail that clip as unmapped → block `apply_replace` unless operator chooses “skip unmapped”.

P0 SHOULD block apply when any V1 clip is unmapped (no silent gaps).

### Timebase

Source of truth for apply: milliseconds (or frames converted with **footage** rate from clipitem / Cut `frame_rate`). Same discipline as panel insert (`startMs` / `endMs`).

## Product API (sketch — not implemented)

Likely shape (final names in `specs/api/cuts.md` when scheduled):

| Step | Idea |
|------|------|
| Preview | `POST /api/cuts/:cutId/premiere-pushback/preview` — body: parsed snapshot or uploaded XMEML; returns diff JSON |
| Apply | `POST /api/cuts/:cutId/premiere-pushback/apply` — body: preview token / idempotency key + confirm; mutates Cut |
| Auth | Settings Bearer + Model B + `platformProjectId` |

Paths only via `apps/web/lib/paths.ts` + `knowledge/paths.md` when added.

Alternative: reuse existing PATCH scene batch APIs after client-side mapping — only if preview/apply audit stays Product-side. Prefer Product-owned parse for safety.

## Panel UX (sketch)

1. Cuts row secondary action: **Cut aktualisieren…** (disabled when AE host).
2. Wizard: Capture → Diff → Confirm.
3. Diff MUST separate **Applied** vs **Ignored**.
4. No auto-run on sequence save or panel focus.

## EARS (intent)

1. WHEN sync runs THEN it MUST be operator-initiated (button), never background.
2. WHEN Cut → Premiere sync succeeds THEN mapped timeline on the Premiere sequence MUST match the Cut.
3. WHEN Premiere → Cut apply is requested THEN the system MUST show a diff including ignored unsupported features.
4. WHEN apply succeeds AND unsupported leftovers existed THEN the panel MUST offer **Premiere aus Cut neu laden** before claiming full parity.
5. WHEN apply succeeds AND operator completes parity refresh THEN both sides MUST match on mapped scope.
6. WHEN required V1 clips cannot map to `mediaAssetId` THEN apply MUST fail closed (unless explicit skip policy is confirmed in a later wave).
7. WHEN apply succeeds THEN Cut `updatedAt` MUST advance and prior `premiere_xml` exports MUST be treated as stale for Open Cut reuse.
8. WHEN host cannot capture sequence THEN file-pick or `unsupported` — MUST NOT invent timeline data.
9. WHEN transitions/effects/nests are present THEN they MUST NOT be written into the Cut as fake scenes.

## Waves (proposed — unscheduled)

### Wave P0 — Spec + spike

- [x] This intent sketch + non-goals + honesty ladder
- [x] Spike: `ProjectConverter.exportAsFinalCutProXML` (≥ 26.2) + file-pick fallback
- [x] Outbound `file-{mediaAssetId}` reused for mapping
- [x] Record in `knowledge/adobe-uxp-cut-pushback-premiere.md`

### Wave P1 — Preview only

- [x] Capture + parse + diff UI (confirm panel)
- [x] Contract tests for mapper (fixture XMEML → diff)

### Wave P2 — Apply + parity refresh

- [x] Confirm → Product `restore` for **V1**
- [x] CTA **Übernehmen + Premiere neu laden** (`parity_refresh` via Open Cut)
- [ ] Staging smoke: edit either side → manual sync → both match on V1
- [ ] V2 / VO lane apply (still ignored in P0 mapper with diff note)

## Open questions

1. Does Premiere UXP on customer builds expose sequence → XMEML export without ExtendScript?
2. Embed `mediaAssetId` (and track role) in outbound XMEML now to make pushback safe?
3. Apply = full timeline replace vs three-way merge with Cut editor concurrent edits?
4. Max sequence size / clip count for parse?
5. Should pushback require Cut lock / “editing in Premiere” banner in web Cut editor?

## Capability alignment

| Surface | Relation |
|---------|----------|
| Open Cut outbound | Prerequisite / complementary; not replaced |
| Cut editor | Remains primary VIDEON timeline UX |
| MCP / Flow | Optional later `videon.cut.premiere_pushback` — human confirm still required on panel |
| Catalog | No id until P1 scheduled |
