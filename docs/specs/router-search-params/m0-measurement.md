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

### Probe 1 — after a sign-out (run 2026-09-02, Chromium, `scripts/e2e-local.sh web:public`)

`account-chip.tsx:182` navigates with `search: { signedOut: 'true' }` — a four-character string.
Read from the raw query the router wrote:

```
?signedOut=%22true%22
```

Twenty-one characters carried for four. Both probes therefore contain `%22`, and **the rule's
condition is not met on either.** Nothing is withdrawn; the epic keeps its scope beyond M1.

The signed-out confirmation was asserted **before** the URL, which is the plan's ordering and not a
stylistic one: this file's `signOut()` helper shipped once with a locator that matched nothing and
nobody noticed, because nothing had ever called it (ADR-0077 M8). A URL read after a sign-out that
did not happen would have reported a passing measurement of the wrong screen. It is also a test of
its own rather than two assertions inside the shipped sign-out test, for the reason the library
probe established the hard way one section up.

The whole suite was re-run: 14 passed, so the probe perturbs nothing here.

## What M0-T1 measured that the reading did not predict

M0-T1's 23 codec assertions were written from F1's reading of `qss.js` and `searchParams.js` and
**all 23 passed on the first execution** — which is independent evidence that F1 is sound, and the
strongest form of that evidence available, since the prediction was committed before the run.

The two **merge** assertions are the exception, and they are the useful part. F5 says a validator
cannot remove a param, and that is confirmed: a validator returning `{}` against `?q=a&n=1` leaves
a consumer seeing `{ q: 'a', n: 1 }`. But the second case was **not** what the reading predicted —
a validator that renames a key leaves the source key in place beside the new one:

```
validateSearch: (s) => ({ kept: s.q })   over   /thing?q=a&n=1
match.search                             →      { q: 'a', n: 1, kept: 'a' }
```

So `validateSearch`'s return is **added to** the parsed search, not substituted for it. F5's
phrasing ("a validator cannot remove a param") understates it and is left standing rather than
rewritten, because it is true; this is the stronger fact underneath it, and it is what makes the
per-route alternative in D-alternatives unarguable rather than merely awkward — a route that
sanitises its own keys leaves every other key exactly as the default codec produced it.

Established against a real `createRouter` over a real `createMemoryHistory`, in
`apps/web/src/app/router-search.characterisation.test.ts`. It could not have been established any
other way: `preMatchSearch` is not exported, and every existing test of this in the repository
feeds `useSearch` a literal and never crosses the router — which is the same blind spot ADR-0074 M5
records as the reason `?verified=1` shipped broken with a green suite.

## M0-T3 — the citations were already registered

`pnpm check:claims` is **green**: 93 claims, and all thirteen of this spec's `@tanstack/router-core`
and `@tanstack/react-router` citations resolve at their pinned `package@version + path + anchor`,
each naming this spec in its `citedBy`. The plan sized the task at "14 entries" of work owed; the
entries had been written into the register when the spec was, so the task was already done and its
definition of done — _that the command has been run_ — is what this line records.

The intended consequence stands and is worth restating where the ADR will pick it up: a Dependabot
bump of either TanStack package now fails CI and forces these thirteen citations to be re-read,
which is exactly the moment they need it (ADR-0076).
