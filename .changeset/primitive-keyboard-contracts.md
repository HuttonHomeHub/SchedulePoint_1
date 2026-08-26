---
'@repo/web': patch
---

Fix two keyboard defects in the shared `Menu` and `Combobox` primitives, found by the first review
run under ADR-0111.

Escape inside either popup also closed the enclosing modal dialog, because both handlers called
`stopPropagation()` without `preventDefault()` — and a dialog's Escape-to-close is a default action,
which propagation does not suppress. In `ResourceFormDialog` and `AddCrossPlanLinkDialog`, which set
no confirm-before-close, dismissing a dropdown discarded the whole half-typed form.

And a portalled menu item's click reached the JSX that encloses the menu, because React dispatches
along the React tree rather than the DOM: choosing an action from a Gantt row's menu also
re-selected the row underneath it.
