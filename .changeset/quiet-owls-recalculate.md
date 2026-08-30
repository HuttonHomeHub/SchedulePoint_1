---
'@repo/web': patch
---

Recalculate confirms again after an auto-recalculation has settled.

The button's stand-down rule asked whether a debounce **handle existed** rather than whether a
settle was **coming**, and the handle was never cleared when the debounce elapsed on its own. So
after any self-firing auto-recalculation, the first press of Recalculate stood down against a settle
that had already happened — and the settle announcer had consumed its baseline on that earlier
settle, so it said nothing either. The press produced complete silence, on the commonest path there
is: edit, let it settle, press Recalculate.

The rule now asks the real question (`a debounce is pending OR a run is in flight`), so an edit whose
dates are still owed still owns the live region and the two announcers cannot collide, while a press
with nothing coming confirms as it always should have.
