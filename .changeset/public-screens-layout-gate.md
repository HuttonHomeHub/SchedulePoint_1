---
'@repo/web': minor
---

Measure the public screens in a real browser, and fix what the measurement found (ADR-0077 M6).

`apps/web/e2e-public` drives the six pre-authentication routes across ten states × six viewports ×
three themes, plus a real invitation carrying a 100-character organisation name and a fulfilled 429.
It found four defects that no unit test could see, because jsdom has no layout:

- The brand band was **stretched** by implicit grid `align-content`, rendering at up to **47% of a
  320×568 phone screen** against a content height of 76px.
- The tagline rendered at every width, against its own acceptance criterion — it is a `md:` band
  caption, not phone content.
- `/verify-email` overflowed a 320px viewport (334px) because the resend button's label could not
  wrap.
- The invitation screens overflowed (327px) because an email address is one unbreakable token and a
  grid column is sized by min-content. `CardTitle`/`CardDescription` now use `wrap-anywhere`.

Also from the enablement gate pass: a server error no longer takes focus off the field you were
typing in, the reset confirmation now says your password was changed rather than only that other
sessions ended, and the "wrong account" screen's Sign out is the primary action it always was.
