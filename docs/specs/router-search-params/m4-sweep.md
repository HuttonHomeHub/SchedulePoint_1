# #96 M4 — the flip, and what the full journey sweep reported

The codec pair replaces the library's at `app/router.tsx`. Two lines, atomic by construction
(`parseSearch` is a router-level option with no per-route override), so the verification is the
milestone rather than the change.

## Unit

`pnpm --filter @repo/web test` — **600 files, 5,558 tests, all passing.**

Three expectations moved, all three in `router-search.test.ts`, all three predicted **on the line**
before the flip existed:

| Case                                  | Was                        | Now                 | Predicted where                       |
| ------------------------------------- | -------------------------- | ------------------- | ------------------------------------- |
| `/reset-password?token=<32 digits>`   | `'1.2345678901234567e+31'` | the token, verbatim | the case's own comment, for two years |
| `/orgs/$orgSlug/calendars?q=2026`     | `{}`                       | `{ q: '2026' }`     | M2-T2, named on the test title        |
| `/orgs/$orgSlug/plans/$planId?view=1` | `{}`                       | `{ view: '1' }`     | M2-T2, named on the test title        |

**Nothing else moved**, which was the milestone's own stop condition. Every value in M3's
differential that was predicted to be untouched by the flip was untouched.

### A finding at the moment of the flip, in the instrument rather than the product

`router-search.test.ts`'s helper docblock says it composes "the router's **real** parser" — and it
named `defaultParseSearch` by hand. So the day the router got a parser of its own, every assertion
in that file would have kept passing while describing a codec the product no longer used. It reads
`router.options.parseSearch` now. That is the `docs/TECH_DEBT.md` #178/#181/#183 shape one more
time: a rule going quiet rather than wrong, and this one would have gone quiet in the file whose
whole subject is the seam it stopped covering.

## The full journey sweep

`scripts/e2e-sweep.sh`, 44 suites: **41 passed, 3 failed.** The sweep's output is a comparison, not
a verdict, so each failure is accounted for.

| Suite     | Result | Account                                                                                                                                    |
| --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `library` | fail   | **The M0 probe doing its job.** It pinned `?q=%222026%22`; the flip made it `?q=2026`, and the failure message was the one written for it. |
| `public`  | fail   | The other M0 probe, the same way: `?signedOut=%22true%22` → `?signedOut=true`.                                                             |
| `csp`     | fail   | **Not this epic's.** Established by running `web:csp` on the pre-flip tree, where it fails identically. Filed as `docs/TECH_DEBT.md` #243. |

Both probes were then **re-baselined line by line, not with `-u`** (ADR-0106's rule): each keeps its
measured before-value in the comment beside the new assertion, and each now asserts the whole query
string with `toBe` rather than a substring with `toContain`, because after the flip there is an
exact answer to assert. Re-run: `library` 3 passed, `public` 14 passed.

**That those two suites failed is the strongest single piece of evidence in the epic.** The probes
were written at M0 to record a measurement nobody could otherwise see, and they are what made the
flip's effect visible in a real browser rather than in a docblock — the failure arrived with the
sentence chosen for it three milestones earlier.

## What the sweep does not prove

The `csp` suite's authenticated case has been failing since before this work, so the CSP gate did
not cover the authenticated shell during this flip. That is #243's cost, recorded there rather than
implied here.
