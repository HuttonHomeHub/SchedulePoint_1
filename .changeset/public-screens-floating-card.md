---
'@repo/web': minor
---

Restore the floating login card, its photographic panel, and one fixed login theme (ADR-0077 §8).

The six public screens become the previous app's shape again: a 900px card floating on a soft
gradient rather than a full-bleed split, with the navy brand panel and its amber seam beside it —
measurements read from the old stylesheets rather than matched by eye. The card is the **same height
on every screen** from `md` up, so moving between Sign in and Create an account no longer resizes the
box under the reader's cursor.

The whole login is now **theme-invariant**, via a fifth surface scope (`auth`). Previously the panel
was pinned and the card beside it still followed the theme, so a Dark-mode visitor met a fixed navy
panel joined to a dark card. The theme now picks up after sign-in, on the app the reader chose to
configure.

Two of the restored colours are corrected rather than copied: the old app's amber focus ring
(2.02:1 on white) and field outline (2.22:1 on the field fill) are WCAG 1.4.11 failures, caught by
the computed contrast matrix and derived down to ≥ 3:1 at the same hue.

The panel's photograph is decoration and is served same-origin under the existing CSP; a missing
file degrades to the navy fill with the wordmark and tagline still legible.
