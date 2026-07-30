---
'@repo/web': minor
'@repo/api': minor
---

WBS improvements: table multi-select, the band in the exported picture, and default-on.

The epic's last three milestones. **M4b** adds bulk assign to the activities table — a selection
column and a bar that files the ticked activities under one summary (or back to the top level),
sharing the same minimal, version-carrying batch the Members panel sends. **M5** puts the pinned WBS
band into the exported PNG/PDF and the derived Unassigned bucket into the printed programme, so the
picture matches the screen; the band's derivation is now a single shared function rather than one
copy per surface. **M6** ran the deferred specialist gates over the whole epic diff and flips
`VITE_WBS_IMPROVEMENTS` **default-on**.

The gates found four defects that had passed a human read, each folded with a regression test:

- selecting a summary while the band was on lost the entire canvas selection-actions bar — the band
  lifts summaries out of the scene, and the anchor lookup only consulted the scene, so Dissolve and
  Edit left the screen _and_ the tab order for exactly the objects the band exists to show;
- the Assign button used the native `disabled` attribute, which blurs to `<body>` the instant it
  flips, on a control that flips twice per save;
- `POST …/activities/:id/dissolve` mutated its children's optimistic-lock `version` and returned
  `204`, leaving every cached child silently stale — it now returns the promoted rows at their new
  versions (**a breaking change to that endpoint's response**);
- and it read those children's new parent from a snapshot taken _before_ the lock it takes to make
  that read safe.

`PATCH …/activities/parents` also makes `parentId` required-but-nullable, so a forgotten field is a
validation error rather than a silent promotion to the top level, and a row naming itself as its
parent is now `422 SELF_PARENT` rather than sharing `PARENT_CYCLE` with the `409` case.

Rollback: `VITE_WBS_IMPROVEMENTS=false`. Every flag-off parity suite is kept and pinned.
