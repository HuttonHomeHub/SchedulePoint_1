---
'@repo/web': minor
---

Light and Dark get their own designed chrome (behind `VITE_DESIGNED_CHROME`)

The last theme values of the designed-UI epic, and deliberately the last: flipping structure and
values in one change makes every flag-off parity suite meaningless on the day it is most needed.

Light's band steps a shade off the page rather than being the page with a line under it, and its
rail sits between the two — so band, rail and content read as a hierarchy. Dark goes the other
way, because a dark theme has no "lighter than white" to reach for: a near-black band with the
content lifted off it. Dark's field is a **raised dark**, not white — a white field on a
near-black band is a glare source at night, which is the condition the theme exists for.

The global flag layer and the `.dark`/`.corporate` blocks have equal specificity and all match
`<html>`, so the global layer wins over a theme block by source order. Every theme-scoped layer
therefore restates the global list in full, including values it does not change — pinned by
`token-architecture.test.ts`, because a forgotten token would silently paint Light's grey on a
dark theme and look like a colour choice rather than a bug.
