---
'@repo/web': minor
---

TSLD ground-vs-non-working differentiation on the web, behind `VITE_CANVAS_TIME_AXIS` (default
off, tsld-toolbar-canvas-refinements M5). The non-working (weekend/holiday) column wash gains a
diagonal hatch stripe — the same rhythm as the shipped float-tail hatch — so a weekend reads as a
distinct kind of surface, not just a darker shade of the month band; guarded to fall back to the
existing flat fill when an offscreen 2D context can't be built (older browsers, minimal test
contexts), keeping the `fillRect` cost identical either way. The month-band ground also gains its
own `View▾ → Structure → Month bands` switch (gated on `VITE_CANVAS_VISUAL_LANGUAGE`, which still
decides whether the layer exists at all) so a user can turn the ground off for the session. Set
`VITE_CANVAS_TIME_AXIS=false` (the default) for a byte-for-byte rollback to today's flat wash.
