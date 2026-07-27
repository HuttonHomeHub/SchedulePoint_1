---
'@repo/web': patch
---

Confirming inside a dialog no longer closes the dialog behind it.

Revoking a share link, or deleting a baseline, opened a confirmation on top of the dialog that
launched it — and answering that confirmation tore down both. The user landed back on the plan with
no way to see the result of what they had just confirmed, and had to reopen the parent to check.

`close` and `cancel` do not bubble, but React listens at the root in the capture phase, and capture
reaches every ancestor on the way down. So the inner dialog's close was delivered to the outer
dialog's handler as well. The `Dialog` primitive now ignores a close whose target is not itself,
which fixes every nesting rather than the two that had been noticed.
