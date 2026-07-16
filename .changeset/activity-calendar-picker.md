---
'@repo/web': minor
---

Web activity calendar picker (M5, ADR-0037), behind `VITE_ACTIVITY_CALENDAR` (off by default). The
activity form gains a **Calendar** `Select` — "Plan default (inherit)" or a specific org calendar —
writing the activity's `calendarId`; the activities table shows an activity's own calendar when it
isn't inheriting the plan's. The picker ships dark until its component/accessibility/UX gates are
cleared; the underlying field, engine, and API are already live, so the flag only governs whether a
planner can pick a per-activity calendar in the UI. The dialog always seeds `calendarId` from the
row, so editing with the picker hidden round-trips the stored value unchanged.
