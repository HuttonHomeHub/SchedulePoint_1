---
'@repo/web': patch
---

Give the public screens a document identity (ADR-0077 M5).

Every route shared one tab title, so three open tabs were indistinguishable and history offered no
way to find the reset link you opened; each public screen now names itself, set before paint so a
screen reader announces the new page rather than the old one. The site also gets a favicon —
previously `/favicon.ico` fell through the single-page-app rule and browsers were handed HTML where
they expected an icon — and a description for when a link is shared.

No `theme-color`: the app has four theme settings and the browser's media query knows two, so any
single value would be wrong for at least one of them.
