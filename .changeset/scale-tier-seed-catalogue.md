---
'@repo/web': patch
---

Add a second scene to the hand-run draw benchmark (`scripts/measure-link-routing.mjs [frames] [scale|grid]`), built from the ADR-0066 scale generator instead of the synthetic lattice. The realistic plan costs 6.7 ms p95 at the working zoom against the lattice's 14.2 ms, and 18.7 vs 11.6 ms with nothing culled — the scene dominates the number, which is recorded against TECH_DEBT #75. No product behaviour changes.
