---
'@repo/web': patch
---

Retire the `VITE_NAV_TREE` flag and delete the two screens behind it.

Neither was reachable — a `VITE_` constant is inlined at build time and no published image passes
one — and one of them had been telling nobody that "the schedule editor arrives in an upcoming
update" for about a year. No user-visible change.
