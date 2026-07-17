---
'@repo/web': minor
---

Duration types & the resource-units rate on the web, behind `VITE_DURATION_TYPES` (default off, M7
rung 4, ADR-0040). The activity form gains a **Duration type** picker (Fixed Duration & Units/Time
(default) / Fixed Duration & Units / Fixed Units / Fixed Units/Time), shown for types that carry an
entered duration. The per-activity resource assignment editor gains, on the **driving** assignment, a
**units/time (rate)** field with its own save and a live "Duration becomes N days" preview for a
units-driven type — a pure client-side mirror of the server's `resolveTriad` (the server stays
authoritative; the preview also mirrors the N20 zero-rate block). A units/rate edit on a rated driving
assignment names its `editedField` so the server recomputes the triad and — for `FIXED_UNITS` /
`FIXED_UNITS_TIME` — derives the activity's duration, refetched into the table. Everything behind it (the
`durationType` / `unitsPerHour` fields, the recompute, the conformance proof) was already live; this only
exposes it in the UI. Set `VITE_DURATION_TYPES=true` to enable it in an environment.
