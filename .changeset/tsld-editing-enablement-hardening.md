---
'@repo/api': patch
'@repo/web': patch
---

Harden the (flag-gated) TSLD on-canvas editing surface toward enablement — no
user-visible change, both editing flags remain off by default.

- **fix(web):** the coalesced keyboard-nudge now flushes a delta queued _behind_ an
  in-flight write on unmount (previously a `!busyRef` guard could silently drop it).
- **perf(api):** the edit-lock heartbeat resolves the caller's own holder profile
  from the session instead of a `users` query — the common beat issues zero extra
  DB reads.
- **test:** a flag-on Playwright harness (`test:e2e:edit`, wired into CI) that serves
  the app with the editing flags on and the API enforcing the lock, with pen-gating,
  single-actor pen-lifecycle, and keyboard-edit journeys (the latter automating the
  `Alt+←/→` history-suppression check on Chromium); plus a route-level `plan-detail`
  gating/reposition-seam test. Operators: see
  `docs/runbooks/tsld-editing-enablement.md` for the enablement procedure.
