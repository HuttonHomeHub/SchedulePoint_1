---
'@repo/web': minor
---

Web advanced-constraints editor (M4, ADR-0035 §7–§11), behind `VITE_ADVANCED_CONSTRAINTS` (off by
default). The activity form gains an **Advanced scheduling** group — a **secondary constraint**
(paired type + date, driving the backward pass), an **As-late-as-possible** toggle, and an
**expected-finish** date — and the plan settings gain an **Expected-finish scheduling** on/off
toggle (`useExpectedFinishDates`). An engine-flagged `constraintViolated` activity (a mandatory pin
produced-and-flagged against its logic) surfaces a **Conflict** badge in the activities table's
Constraint column. The editor ships dark until its component/accessibility/UX gates are cleared; the
underlying fields, engine passes, and API are already live, so the flag only governs whether a
planner can edit and see them in the UI. The dialog always seeds the advanced fields from the row,
so editing with them hidden round-trips a stored value unchanged.
