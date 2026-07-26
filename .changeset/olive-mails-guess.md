---
'@repo/web': minor
---

Give the TSLD diagram a **ground of its own with alternating month bands**, behind
`VITE_CANVAS_VISUAL_LANGUAGE` (default off, ADR-0055 S4).

A time-scaled diagram exists to make time legible, and counting months by reading labels is work
the surface should be doing. Banded ground makes it free. Three decisions worth knowing:

- **Banding is ground, not a gridline**, so it deliberately does not follow the `Month grid`
  toggle — that toggle governs a line, this governs a surface.
- **Parity is the absolute month ordinal**, not a running count of crossed boundaries, so the
  stripes cannot invert when the viewport pans.
- **The band is opaque**, not an alpha wash: an alpha band would tint whatever it overlaps and
  would have to be re-checked against every layer above it.

The canvas now reads `--canvas` / `--canvas-band` rather than borrowing `--card`, and the lag
handle's halo follows that ground — it is the theme-inverse of the handle's core, so it must track
the surface it is meant to match rather than silently drifting from it. Both tokens are valued
identically to `--card` in every theme block, so the re-point is a **no-op** until the flagged
cream values apply.

The month/year boundary walk is now computed **once per frame** and shared by the bands and the
gridlines. Two walks could disagree by a day; one cannot.

Cost is pinned by a new counting-stub gate (`paint.band-budget.test.ts`) at 2,000 activities, at
day zoom **and** at year zoom over a multi-year span — the case a naive per-day loop would blow up
on: at most `visibleMonths + 1` extra `fillRect`, and not one glyph of text. Flag-off the scene
carries no `monthBands` at all, so the band layer is skipped entirely and the frame is
byte-for-byte today's paint.

Not in this slice, and deferred deliberately rather than rushed into the hot path: the tiered
ruler redesign and the TODAY chip.
