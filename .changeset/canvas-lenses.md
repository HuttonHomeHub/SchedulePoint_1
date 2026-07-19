---
'@repo/web': minor
---

TSLD canvas insight lenses (Stage A of the toolbar-placeholder burn-down) — three previously-"Coming
soon" Look-row controls are now wired to already-shipped data as pure client render lenses, **on by
default** (`VITE_CANVAS_LENSES`, set it to `false` to restore the placeholders). Frontend-only: no API,
schema, `@repo/types`, or CPM-engine change; the recalc parity gate is untouched.

- **Filter / Search** — a live search field + a Filter menu (Critical / Has constraint / Has conflict)
  that **dim** non-matching bars (shade-don't-remove; geometry, lanes and logic lines stay put), mirror
  the parallel a11y listbox, and announce the match count.
- **Colour by…** — recolour bars by Criticality (default, byte-for-byte today's fills) / Total-float
  bucket / WBS group, with a mode-aware Legend, contrast-safe inside-bar labels, and the critical outline
  retained in every mode (never colour-only). Driving-resource colouring is a deferred fast-follow.
- **Baseline overlay** — ghost outline bars behind the live bars at the active baseline's captured dates
  (reusing the shipped variance read; culled with the bar layer), with a Legend key; disabled-with-reason
  when there's no active baseline.

All three are theme-reactive (a shared `useThemeVersion` hook re-resolves the palette on a light/dark
switch). WCAG 2.2 AA; covered by unit tests. `VITE_CANVAS_LENSES=false` restores the toolbar and the
canvas paint byte-for-byte (rollback).
