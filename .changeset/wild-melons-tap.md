---
'@repo/web': patch
---

Corporate's Project Explorer becomes a **light working surface** behind `VITE_DESIGNED_CHROME`
(ADR-0055 S3).

One dark band across the top and two light surfaces below it reads as a designed application;
three competing dark/light regions does not. The values live in a `[data-designed-chrome].corporate`
layer, so flag-off the rail is navy again with no code path involved — the rollback stays
byte-for-byte for colour. Light and Dark are untouched here.

The rail's boundary against the page is 1.09:1, which is deliberately a preference rather than a
WCAG rule (1.4.11 exempts a decorative surface edge) — so the contrast suite reports it instead of
gating it, and the rail keeps a real border rather than relying on the fill difference.

Two rail refinements ride along, both token-only and geometry-safe: the root create affordance
becomes a labelled `+ Client` primary button instead of a bare `+` glyph (creating the first client
is the one action an empty explorer exists to offer), and client rows carry the heading weight their
level implies.

Deliberately **not** in this slice: the reference's rail search field and All/Clients/Projects/Plans
filter chips. The tree loads lazily, one query per expanded node, so neither is buildable
client-side — both need an org-scoped hierarchy search endpoint and belong to their own spec.
