---
'@repo/web': patch
---

perf(web): pause the TSLD render loop when the canvas is off-screen; a11y + dedup cleanups

Fast-follow debt paydown on the canvas-first plan workspace (TECH_DEBT #30/#31):

- **Perf (#30d):** the TSLD canvas now pauses its `requestAnimationFrame` paint/measure work when
  it's off-screen (the below-`md` Activities pane showing, so the diagram pane is `display:none`),
  via an `IntersectionObserver`, and re-arms a repaint the moment it returns — no more painting an
  unseen canvas every frame on mobile.
- **A11y (#30h):** the docked activities panel's landmark is renamed "Activities panel" so it no
  longer collides with the inner table's "Activities" scroll region (axe `landmark-unique`).
- **Dedup (#31b/#30b):** the Plan details / Baselines / Calendar dialogs are extracted into one
  shared `PlanChromeDialogs` used by both plan layouts (so their copy can't drift), and the plan
  header's overflow menu adopts the shared `useMenuTrigger` hook.

No behaviour change beyond the two polish items above.
