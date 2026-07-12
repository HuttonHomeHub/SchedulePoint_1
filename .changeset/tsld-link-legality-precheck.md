---
'@repo/web': patch
---

Add a client-side link-legality pre-check to the TSLD dependency-draw (flag-gated
editing, `VITE_TSLD_EDITING`). While drawing a dependency, the hovered target now
rings by legality — a legal drop rings solid; a self-link, duplicate, or cycle rings
dashed in the critical colour (colour and dash, not colour alone) — and an illegal
drop the loaded graph already proves invalid is refused locally with an explanation
(no round-trip to the server, which stays authoritative). Closes the ADR-0026 D5
"live legality feedback" follow-up.
