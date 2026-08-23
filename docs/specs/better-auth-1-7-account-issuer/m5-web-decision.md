# M5 — CQ-4: does `apps/web` take the bump?

**Decision: yes, both workspaces move to `^1.7.1`.** That is the spec's stated default, but it
arrives here for a **stronger reason than the spec had**, and the reason is not the bundle.

## The forcing constraint, found by doing it

`apps/api` was bumped first and `apps/web` deliberately left at `~1.6.28`, which is exactly the
"one pinned and one unpinned copy" state the spec's default was written to avoid. Then
`pnpm check:claims` reported:

```
Dependency claims OK (52 claims against better-auth@1.6.28, …)
```

**Green, against a version the API no longer loads.** `apps/api/node_modules/better-auth` was 1.7.1
at that moment; the gate verified every claim against 1.6.28 and said so without complaint. That is
`docs/TECH_DEBT.md` #178 in its stated "dangerous direction — the quiet one", observed live rather
than reasoned about.

Two structural facts make it unavoidable rather than a fixable slip:

1. `installed()` (`scripts/check-claims.mjs`) resolves a package with
   `readdirSync(store).find(entry => entry.startsWith(name + '@'))` — **the first matching store
   directory**. Printed here, that order was `better-auth@1.6.28…` then `better-auth@1.7.1…`, so
   1.6.28 wins.
2. `verifiedAgainst` is **one value per package**. The register has no way to say "1.7.1 for the
   API, 1.6.28 for the web client", and 40-odd claims about auth behaviour would have to mean one
   or the other.

So holding `apps/web` at 1.6.28 does not merely leave the estate untidy: it makes the claims
register **structurally unable to describe the code that ships**. Re-anchoring to 1.7.1 would then
fail the gate; leaving it at 1.6.28 keeps it green while verifying the wrong copy. Neither is
acceptable, and no amount of care fixes it, because the gate cannot express the split.

With both workspaces on `^1.7.1`, `pnpm-lock.yaml` holds **zero** references to 1.6.28, the orphan
store directory was removed, and the gate reports `better-auth@1.7.1`.

## The falsification condition was still measured, and it passes

The spec's condition was: **hold `apps/web` at 1.6.28 if the 1.7 client costs more than 5 kB gzip on
the initial bundle, or fails a public journey.** Measured rather than waived, because a forced
decision that is also a bad decision is worth knowing about.

|                                            |  initial gzip |
| ------------------------------------------ | ------------: |
| baseline, 1.6.28 (`m5-bundle-baseline.md`) |       393,930 |
| after, 1.7.1                               |       394,004 |
| **delta**                                  | **+74 bytes** |

Threshold +5,120. **Passes with 70× margin**, so the two arguments agree and there is no conflict to
put to the product owner. Had it failed, the register constraint above and the bundle budget would
have pointed opposite ways, and that would have been a real decision rather than a measurement.

## Journeys (M5-T2): run, not written

ADR-0081's obligation is met by the **existing** journeys, which already drive the three account
paths against a real API. All three pass at 1.7.1:

- `web:public` — 13 passed. Every pre-authentication screen and state.
- `web:account` — 2 passed. **"a locked-out member recovers their account, and the old session
  dies"** and "a signed-in member changes their password from /account". The first is the one that
  matters: it drives a real password reset, which at 1.7 goes through the sign-in predicate this
  whole epic exists for, and asserts session revocation.
- `web:account-verify` — 2 passed. Sign-up with verification enforced, and the invitee path.

Plus `scripts/e2e-local.sh api` — **565/565**, against the 522-failures-of-559 baseline recorded in
`docs/TECH_DEBT.md` #176 for 1.7 without the column.

## What this did NOT fix

#178 is **worked around, not closed**. The workaround is "only ever have one version of a cited
package installed", which held here only because the split was ours to remove. A transitive
dependency pulling a second copy of a cited package would reproduce it with nothing to bump. Fixing
the resolver is a shared-gate change and fires ADR-0105's trigger, so it is not being smuggled into a
dependency bump. Same for #181 (a `ref` carries no version), which this milestone also exercised.
