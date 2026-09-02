# #96 M0 — the measurement, and its verdict rule

## The rule, committed BEFORE the probe runs

> **If either URL contains no `%22`, symptom (b) is WITHDRAWN.** The spec's §1(b), CQ-1 and half of
> D1's motivation go with it, amended in place rather than deleted, and the epic is re-scoped to M1
> alone.

Written first and committed on its own, because a measurement without a rule written in advance is
read as whatever result arrives. This register has that failure twice: ADR-0090 was drafted without
a shell and ended in two predictions that were both falsified on the first run, and ADR-0097
Landing C's harness reported a PROCEED off a 37-pixel plan name it had substituted for a real one.

**The two probes**

1. **After a sign-out.** Assert the signed-out heading FIRST, then read `page.url()`. The base
   journey's `signOut()` helper shipped once with a locator that matched nothing and nobody noticed,
   because nothing had ever called it (ADR-0077 M8) — so a helper that did not sign out must fail as
   a sign-out failure, not as a URL result.
2. **After typing `2026` into the calendars search field.** Read the **raw** query string, not
   `searchParams.get(...)`: the decoded value hides the quoting, which is the whole subject.

Both run through `scripts/e2e-local.sh`, which refuses to start while anything answers on 3000 or
5173 — `reuseExistingServer` is true outside CI, and a server left over from another suite silently
supplies that suite's flags (ADR-0099 records three consecutive false diagnoses from exactly that).

## Result

_Not yet run. This section is filled in by M0-T2, with the verdict stated against the rule above._
