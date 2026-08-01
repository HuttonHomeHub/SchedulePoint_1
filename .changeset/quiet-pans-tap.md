---
'@repo/web': minor
'@repo/api': patch
---

Fold the ten blocking findings from the shift-editor epic's five specialist gates (ADR-0067 M4).

The largest was a **dead end**: a calendar with no working week — the shutdown/turnaround shape the
epic exists to make authorable — could be created by the Window-only preset and then never saved
again, because the form kept a hidden `workingWeekdays >= 1` rule that the shift editor does not
render. Save was refused by a control that was not on screen.

Also folded: the night-shift affordance the ADR describes now exists (it wrote instructions for
doing the arithmetic by hand, and left the helper that does it with no callers); focus is claimed on
opening a per-row exception edit and handed back on closing it; three Save/Add buttons move off the
native `disabled` attribute onto the `aria-disabled` + inert-class pair, including one that
announced as unavailable while staying fully clickable; the hours-per-day advisory and warning are
`aria-describedby`-linked to the field and the warning stops interrupting on every keystroke;
adding and removing a period announces the settled result; a read-only week says why it is
read-only; the two menu triggers use the shared `Button` instead of re-declaring its recipe by hand;
the create dialog widens to fit the week editor it now carries; and one duplicate element id.

On the API side this is documentation accuracy, not behaviour: `docs/API.md` gains the
standard-working-day section and the `CALENDAR_HAS_NO_WORKING_TIME` 422, which is now declared on
the three routes that can return it, and every `…Days` field's OpenAPI description says which
calendar's day it is measured in.
