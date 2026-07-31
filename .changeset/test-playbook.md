---
'@repo/web': patch
---

Add `docs/TEST_PLAYBOOK.md` — per capability, which seeded plan proves it, what to look at, what correct looks like, and what wrong looks like — gated by a new `pnpm check:playbook` that compares every row against the plans the builders actually produce, in both directions.
