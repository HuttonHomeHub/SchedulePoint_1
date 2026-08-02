---
'@repo/api': minor
'@repo/types': minor
---

Phase a late-joining resource's cost from the day it arrives

Earned Value time-phased a leaf activity's planned value with **one** percentage over **one** window,
so a crew joining three days into a fortnight had its cost recognised as if it had been there from the
first day. PV now splits into cost components: the activity's own expense keeps the activity's window
(it belongs to no resource), and each assignment phases over `[start + lag, finish)` on the activity's
calendar.

**The zero-lag path takes the previous expression verbatim, and that is a hard requirement rather than
an optimisation.** Summing rounded per-component values can differ from rounding one total by a minor
unit, and a silent ±1 on the planned value of every plan already in the system is exactly the class of
defect that survives review. An activity reaches the component sum only when a lag asks it to, and the
new `costPhasingLaggedCount` on the Earned-Value response is the observable proof of which path ran —
`0` on every plan with no lag.

Accrual stays a property of the **activity** (ADR-0044 §32), which produces one asymmetry worth
knowing before writing a test against it: under `END` a lag is a **no-op**, because everything is
recognised at the finish whatever time the resource arrived; under `START` a lagged assignment
recognises when its resource joins, not when the activity starts. Same enum, opposite sensitivity. A
lag at or past the span collapses the component to a point and then behaves exactly like an existing
zero-duration activity — reusing that convention rather than inventing a rule for the degenerate case.

A lag phases PV and nothing else: earned value, actual cost and budget at completion are unchanged for
a lagged plan, and there is a test that says so. Wiring a lag into the performance percent would make
a late crew look like less work done, which is a different and wrong claim.
