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

## Result — **symptom (b) is CONFIRMED. The rule does not falsify.**

### Probe 2 — a numeric library search (run 2026-09-02, Chromium, `scripts/e2e-local.sh web:library`)

Typing `2026` into **Search calendars** produced, read from the raw query string:

```
?scope=all&q=%222026%22
```

`%22` is `"`. The term the planner typed is four characters; the URL carries six, because the value
round-tripped through a JSON parse and came back re-quoted. So the address bar a planner copies and
sends to a colleague is not the one they can read, and the spec's §1(b) stands.

**The rule's condition is not met, so nothing is withdrawn.** The epic keeps its scope beyond M1.

### What the probe cost, which is worth recording

Written inline in the middle of the shipped `e2e-library` journey, it **broke that journey** — a
later assertion went from one match to a strict-mode violation on two. Established as mine rather
than assumed: the suite passes on the stashed tree and fails with the probe, run back to back.

A probe that perturbs the journey it borrows is measuring a state the product does not otherwise
reach, so it moved into a test of its own. That is the same rule ADR-0081 states for a measurement
harness — say where you bypass the product — applied one step earlier: **do not make the product
do something it would not, inside a test that other assertions depend on.**

### Probe 1 — after a sign-out

Deferred to the same commit as the standalone probe above; the sign-out helper is in
`e2e-public/support.ts` and its assertion order (heading first, URL second) is set by the plan for
a recorded reason — ADR-0077 M8's helper had a locator matching nothing and nobody noticed, because
nothing had ever called it.
