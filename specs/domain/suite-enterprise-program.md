# VIDEON — Suite Enterprise Program

**Status:** Accepted (program) — 2026-09-25. E4/E1 Plexon-Clients; Hook: Pipeline nach `markAnalysisFinished(…, succeeded)` (Actor: `requestedByPlexonUserId`). Client-Room `videon_cut` folgt.  
**Programm:** `plexon-v3/specs/domain/suite-enterprise-program.md`  
**Federation:** `2026-05-plexon-federation-v3`

## Pflicht

| Welle | VIDEON liefert |
|---|---|
| E1 | Letztes Medium und letzter Cut (Name, Status, Deep-Link) für das Lagebild. |
| E2 | Ein Cut gilt als Slot `videon_cut` erst nach Export-Freigabe. |
| E4 | Audit bei Analyse, Export und Brand-Check. |
| E5 | Brand-Check vor Export ist eine Sperre: ohne bestandene Messung gegen die aktive Guideline kein freigegebener Export. Dieselbe BRANDION-Messung, kein eigenes Pass. |
| E7 | `mediaRefs` am Kampagnenbrief. |
| E8 | Deep-Link auf den Cut in der Krisenvorlage. |

## Sperre

Export-Freigabe speichert `guidelineId`, Version und den Messlauf. Ein fehlender Brand-Check lässt den Schnitt in der App zu und verweigert die Freigabe für Kundenraum und `videon_cut`-Slot.

## Annahme

- Reframe und Generate bleiben Agent-Jobs, bis das Programm sie ausdrücklich als Flow-Kinds aufnimmt. Diese Datei tut das nicht.
- Der Schnitt heißt Cut.

## Acceptance

Ein Export ohne Brand-Check ist in der Mediathek vorhanden und im Kundenraum nicht sichtbar.
