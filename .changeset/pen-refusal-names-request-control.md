---
'@repo/web': patch
---

A shut control now names a button you actually have.

When someone else holds the plan's edit lock, shaded actions said "Start editing to change this
activity" — but that reader's screen shows **Request control** and no Start-editing button at all.
A Viewer got the same sentence, pointing at a button their role will never produce. The refusal now
names the holder and the control that would help, says "your role" when the role is what is missing,
and still says "Start editing" when the lock is simply free.

Applied across all eleven sites that had written their own copy of it — the TSLD toolbar, the canvas
selection bar and the activity editor — from one shared derivation, so they cannot drift. **Edit
plan** in the header menu is now shaded with its reason instead of vanishing. Closes
`docs/TECH_DEBT.md` #114, #115 and #116.4.
