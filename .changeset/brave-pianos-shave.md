---
'@repo/web': minor
---

Add the **designed chrome band** behind `VITE_DESIGNED_CHROME` (default off, ADR-0055 S2).

With the flag on, the header row and — when a plan is open — its two toolbar rows render as one
full-bleed band across the top of the app, with the Project Explorer and the workspace below it.
The band is navy in Corporate and neutral in Light/Dark, and its height follows its content: one
row on a list screen, three on a plan.

The toolbar reaches the band through a **portal**, so only its DOM node moves. In the React tree
it stays exactly where it was, which is what keeps `usePlanWorkspaceModel`, `useTsldToolbarContext`
and every ADR-0031 registry predicate untouched — and keeps the shell ignorant of plans (ADR-0029).

Two shipped keyboard contracts had to be made portal-safe **first**, because both would have
broken silently: the `?` shortcuts sheet and the ADR-0048 undo/redo accelerators were native
`keydown` listeners on the workspace root, and a native listener follows the DOM tree. They are now
one React `onKeyDown` (`usePlanWorkspaceKeyScope`), which follows the React tree and therefore
crosses the portal by construction. Every binding is regression-tested from a portalled control.

The flag also stamps `data-designed-chrome` on `<html>`, which activates the flagged token layer —
so the rollback is byte-for-byte for colour as well as structure. `VITE_DESIGNED_CHROME=false`
renders today's shell exactly: header as its own measure-capped chrome surface, no band, no slot,
and `ChromePortal` an identity wrapper. Pinned by a flag-off parity suite that is kept, not
weakened, when the flag flips.
