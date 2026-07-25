---
'@repo/web': minor
---

feat(web): activity-bar visual refresh on the TSLD canvas (canvas direct manipulation M4, ADR-0052)

Fourth slice of the canvas direct-manipulation upgrade, behind the SAME
`VITE_CANVAS_DIRECT_MANIPULATION` flag (default **off**). Render-only and role-independent
(Viewer/External Guest included): when on, the activity bars get the M4 visual refresh —

- **Refreshed bar shape + stroke layering:** subtly rounded corners (`roundRect`, with a square
  fallback on contexts without it), a calm hairline definition stroke (the border token) on
  normal bars, and a **stronger 2px critical/near-critical emphasis outline** — the solid/dashed
  non-colour cue is retained (WCAG 1.4.1) — so the critical path pops against calmer normal bars.
- **In-bar progress fill:** the completed portion (`percentComplete`, the same value the row/AT
  reports) as a shape-bounded band along the bar bottom plus a hairline divider at the progress
  front (a boundary/shape cue, never colour alone). Drawn in the bar's **paired label ink**
  (or the Colour-by `barInk` override), so contrast holds on every fill in both themes and under
  every lens; culled below the label LOD zoom threshold and on too-narrow bars.
- **Consistent glyph language:** refined milestone diamond (hairline-outlined when not
  emphasised), an LOE/hammock **bracketed-span** glyph (overhanging end caps) and a WBS-summary
  **bracket** (downward end tabs), each drawn in the bar's own resolved fill so the colour-mode
  lenses recolour the whole glyph as one shape.
- **Interaction states:** a rounded selection ring that tracks the bar's corners, an idle
  **hover ring** (muted, lighter than selection — published from the already-armed hover
  hit-test, no new per-move work), and rounded drag/resize ghosts with elevation approximated by
  a double stroke — no shadow/blur (the ADR-0026 draw budget).
- **Labels + badges:** inside labels nudge clear of the rounded corner (LOD gating, truncation
  and collision logic unchanged); the constraint pin gains the foreground outline the other three
  badges already carry (one badge family) — every badge **shape, legend entry and a11y string is
  byte-identical** (string-parity tests).

All colour resolves from the semantic design tokens via the extended `TsldPalette`
(`barStroke`, `hoverRing` — resolved once per theme bump, never per frame); the refresh composes
with `barFill`/`barInk` (the lens owns colour, M4 owns shape) and the legend stays accurate.
Frontend-only — no API/schema/engine change (the recalc parity gate is untouched). Flag-off the
canvas paints byte-for-byte today's (recording-context parity tests).
