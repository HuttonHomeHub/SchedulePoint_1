---
'@repo/web': patch
---

Add the `brand` surface scope's token family (ADR-0077 M3). **Nothing changes for a user** — the
family exists, complete, in all three themes, and nothing renders it yet. Shipping it separately is
what lets the visible panel land as one revertible commit.

The family is deliberately **theme-invariant**: identical values in Light, Dark and Corporate,
because a signed-out visitor cannot choose a theme and something else chooses one for them. The
computed contrast matrix now sweeps it across every theme, and the structural seam test guards it in
the same regexes as `chrome` and `panel` — the place the protection actually lives.
