---
'@repo/web': minor
---

Make the TSLD canvas read like a time-scaled document. The diagram now has a sticky,
**adaptive date ruler** across the top (year → month → day bands that re-scale as you
zoom), **zoom presets** (Day / Week / Month / Quarter / Year) with zoom −/+ alongside
Fit, a **TODAY** marker, **non-working-day shading** (weekends _and_ the plan
calendar's holiday exceptions), and five **layer toggles** (day / month / year grid,
today, non-working) to declutter. All view controls are available whether or not
you're editing, and every control is a real, labelled, keyboard-operable button or
checkbox.

Entirely client-side and within the existing canvas architecture (ADR-0026): the
ruler is a DOM overlay updated imperatively from the render loop so the viewport
stays ref-authoritative (no per-frame React state), the new paint layers are culled
and batched to hold the draw budget, and the accessible parallel listbox is
unchanged. No API, database, or schedule-engine change.
