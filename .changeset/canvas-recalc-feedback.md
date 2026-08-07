---
'@repo/web': patch
---

A recalculation now shows it is working and says what settled. While the schedule is being
recalculated — whether you pressed Recalculate or simply moved a bar, which recalculates on your
behalf a moment later — the Recalculate button's icon spins, so the surface that is about to move
every bar on the canvas is no longer doing it invisibly. The busy state is also carried by
`aria-busy` and the existing "Recalculating…" tooltip, because the app reduces every animation for
anyone who has asked for reduced motion, and a spinner would be the one cue they never see.

When the recalculation settles, the diagram says what changed. Editing a bar used to announce a
promise — "Moved 'Excavate'; dates will update." — and then the dates updated in silence, so the
only thing a screen-reader user was ever told about their edit was said before the new dates
existed. The settle now names the activity and its resulting dates, and adds the project finish as
a separate sentence when that moved too. Nothing is announced when nothing moved, when the
recalculation was somebody else's, or when it failed — in which case the existing error message
stands on its own.
