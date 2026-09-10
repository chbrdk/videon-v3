# Adobe UXP — Cut ↔ Premiere manual parity

**Spec:** `specs/domain/adobe-uxp-cut-pushback-premiere.md`  
**Updated:** 2026-09-10  
**Panel:** ≥ **0.1.28**

## Product ask

Manual buttons; Cut-Modell V1 sync. **Best-effort Premiere NLE capture** in Cut data (no Videon UI) — clip residual + V1 track + sequence extras. See `knowledge/adobe-uxp-pushback-effects-backlog.md`.

## Buttons

| Button | Direction |
|--------|-----------|
| **In Premiere öffnen** | Cut → Premiere |
| **Premiere aktualisieren** | Fresh ZIP + replace linked sequences |
| **Cut aktualisieren → Übernehmen** | Premiere → Cut only |
| **Übernehmen + Sequenz ersetzen** | Apply + replace |

## Operator

UDT Unload → Load → **v0.1.28**. Diff lines: `Clip-Sidecar` / `Track-Sidecar` / `Sequenz-Extras` when present.
