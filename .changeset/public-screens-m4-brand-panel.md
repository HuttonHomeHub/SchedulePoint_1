---
'@repo/web': minor
---

The public screens get a brand surface (ADR-0077 M4). This is the visible change.

Sign-in, sign-up, the three account-recovery screens and the invitation screen now sit beside a
fixed dark navy panel carrying the SchedulePoint mark, a token-drawn time-scaled logic diagram, and
the tagline. Below `md` the panel becomes a band above the card.

**The panel does not follow the theme, and that is deliberate.** A signed-out visitor cannot choose
one — the theme boot script picks Dark from their operating system, or Corporate because a colleague
signed in on this machine last month — so the one screen where the product has to be recognisable
was rendering in one of three identities, chosen by something the visitor did not do and cannot
undo.

The diagram is the product's own picture rather than stock decoration: bars on a time axis joined by
logic, drawn entirely in design tokens so the computed contrast suite can see it, and inline so it
costs no request and the Content-Security-Policy cannot block it.
