---
'@repo/web': patch
---

One press takes every reading the performance probe can take.

The panel led with three selects and a Run button, so a complete set of readings was four separate
presses with three fields to set correctly each time — and the readings that resulted were four
unrelated rows. **Run all measurements** now walks every measurement at both framings under one
sitting id, announcing each step as it starts and as it settles, and **Check the probe works** does
the same at one repeat for anyone who wants to know the probe runs here before committing two
minutes to it. Both confirmations state their own duration, derived from the plan they are about to
run rather than from a constant. The three selects are still there, behind a **Measure one thing**
disclosure.

A refused step no longer ends the sitting, and a step whose figures failed to store keeps them so a
retry can send them: what a press produced is reported per step, in a vocabulary that distinguishes
a reading the machine declined from one nobody attempted.

It also repairs a defect that had made half of those readings unstorable since the revision-compare
measurement shipped: that scene reports one more field per measured window than the API accepts, so
every reading of it was refused. Each window is now built field by field at the boundary.
