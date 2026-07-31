---
'@repo/web': patch
---

Fix the scale generator's topology: its bands ran in series, so a generated plan was one dependency chain through almost every activity — the engine returned 96% of tasks critical at zero float and a ten-year duration for 500 activities. Bands now hand over to the same band of the next phase, running as four concurrent streams. Adds `longestChainFraction` to the declared shape, with a regression test verified to fail against the old topology.
