---
'@repo/web': patch
---

Adopt the `PageContainer` archetype on the nine screens that were still hand-writing the page
frame, and gate it so it cannot drift back.

`PageContainer` exists because the frame `mx-auto w-full max-w-6xl flex-1 p-6` had been hand-written
fourteen times; the archetype then shipped and nine route files went on hand-writing it anyway
(thirteen sites), so the measure, the padding and the `flex-1` contract still could not be changed
once. The conversion is render-identical — `width="default"` **is** `max-w-6xl` and the remaining
classes are the same set — so no screen changes.

A structural test now refuses a hand-written frame anywhere outside the archetype. It reads balanced
string literals rather than lines, because the frame is a set of classes whose order is arbitrary
and an exact-string scan is defeated by reordering them. Two screens are declared exceptions with
their reasons — the account screen and the onboarding card are deliberately narrower than any
measure the archetype offers, so converting them would widen them.
