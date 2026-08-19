---
'@repo/web': minor
---

Graphite M2 — the plan workspace's shell becomes one CSS grid, so the command band can span the
columns a context drawer will sit inside. Opening the drawer will change the band's width by zero
because of where it is placed, not because anything measures it (ADR-0099). Nothing moves on screen:
verified by pixel-diffing every screen at three widths against the same build without the grid.

Completes the Graphite palette. `--card`, `--popover` and the canvas ground were still light, so
every dialog, menu and popover painted low-contrast grey on white — 58 WCAG contrast failures on the
base journey.

Retires the `VITE_DESIGNED_CHROME` feature flag. The grid shell has to place the band and the body
as siblings, so the flag's off-branch became a second layout of the shell rather than a guard; its
two Playwright harnesses were converted first, and the theme-parity sweep now runs against the
shipped shell.
