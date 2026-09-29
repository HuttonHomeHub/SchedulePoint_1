---
'@repo/api': minor
---

Earned Value now phases planned value over placed dates; SV and SPI change for plans with hand-placed
activities (and EAC, ETC and VAC under the `CPI_TIMES_SPI` method). A baseline that recorded placements
uses its frozen placed span, one that never did keeps its early span, and with no baseline the live
budget follows the bars as drawn. A plan with no placement reads exactly as it did.
