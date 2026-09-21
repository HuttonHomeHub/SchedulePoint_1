---
'@repo/api': minor
---

Derive a cross-plan interface from the upstream predecessor's **placed** dates, not its earliest.

A live cross-plan dependency's forward bound (ADR-0045 §2) folded the upstream predecessor's
persisted `earlyStart`/`earlyFinish` into the successor's ADR-0043 external instants. It now folds
its **placed** span — the effective-Visual start/finish the engine writes for every activity. A
programme interfaces on where the upstream work is planned to happen, not on the earliest the
network would allow it to, and that is the answer a downstream planner would give if you asked them
when the handover is. Before this epic collapsed the `EARLY`/`VISUAL` split there was no single
column that meant that, which is why the derivation read the earliest one.

**The backward direction is deliberately NOT the mirror of it.** `successorLate*` stays
`successorLate*`: a placement is a statement about where work is planned to start, there is no such
thing as a placed late finish, and the latest a network tolerates is a question a hand-placement is
not an input to. The symmetry is tempting enough that a structural test asserts the negative rather
than leaving it to a comment — and that test was verified red both ways, so renaming the backward
side fails it and switching only one of the two forward producers fails it.

**Both recalculate routes carry the change**, because the derivation runs inside ordinary
single-plan recalculation whenever the plan has any active cross-plan edge — not only inside
`…/recalculate-programme`. A plan with no cross-plan edges is unaffected in either route, and no
request or response shape changes.

The fields are renamed with the switch rather than left reading `predecessorEarly*`. A name that
says "early" over a column holding placed dates is the silent redefinition this epic refuses
everywhere else, and it is the defect most likely to survive review: every call site keeps
compiling and every test keeps passing while the word stops being true.

The pure engine is untouched — `computeSchedule` still never sees a cross-plan edge, its arguments
are assembled exactly as before, and the change is entirely in which persisted column feeds them.
