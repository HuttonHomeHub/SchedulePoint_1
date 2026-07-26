---
'@repo/web': patch
---

Docs: accept ADR-0055 and close the designed-UI epic's paper trail

ADR-0055 moves to Accepted with the flip recorded. The ADR index had drifted badly — 0030–0037,
0046–0048 and 0054 were never added — so it is filled in and re-sorted, and CLAUDE.md §16 gains
0054 and 0055.

`FRONTEND_QUALITY.md` gains the flag-on e2e suite alongside the flag-off one and a third habit
next to the two it already listed: a reported ratio is **recomputed, not quoted**, and the
decorative-border exemption covers `--border` only — never `--input`, which is how a 1.26:1 field
outline survived in every theme.

`TECH_DEBT.md` #59 records what the epic did not establish: every draw measurement this project
has made was on a headless cloud runner, not ADR-0026 §16's device envelope, so the ≤ 4 ms budget
is a design target rather than a verified property.
