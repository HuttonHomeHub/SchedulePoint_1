---
'@repo/api': patch
---

Conformance harness M4 flip (M4-F6). The differential adapter now **feeds** the fixture's advanced
constraints instead of dropping them: the secondary constraint (§10), expected finish (§9) and
as-late-as-possible (mapped to the placement flag, §11) are carried, and the mandatory pins pass
through as produce-and-flag constraints (§7). Scenario **S12 (Expected Finish)** is now a runnable
differential — it runs the S02 progressed network with the option on, so `resultsDiffer(S12, S02)`
proves the fixture's A6200 lands on its expected finish. New negative-case assertions cover **N10**
(an impossible mandatory pair is produced and flagged, never repaired) and **N15** (a constraint
before the project start warns without pulling work back). The capability matrix flips the five M4
rows (mandatory / expected-finish / secondary ✅, ALAP 🟡 with the M6 free-float note, zero-duration
task ✅) plus S12, N01/N03, N10 and N15.

Also refines Expected Finish (§9) to apply to **any incomplete activity** — an in-progress one's
remaining and a not-started one's full duration — matching the ADR's A6200 (not-started) example; the
backward pass uses the resized span so late dates stay consistent. Byte-parity of the golden suite is
preserved (a new first-principles A6200 golden pins the resize).
