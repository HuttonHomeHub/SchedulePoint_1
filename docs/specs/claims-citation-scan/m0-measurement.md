# #240 M0 — the measurement, and where it corrects the spec

Run 2026-09-02 on a clean checkout of `wip/240` (the spec commit only; no script edits in flight).

## Control

`pnpm check:claims` reads:

```
Dependency claims OK (94 claims against better-auth@1.7.1, better-call@1.4.0,
@better-fetch/fetch@1.3.1, nodemailer@9.0.5, zod@4.4.3, @nestjs/throttler@6.5.0,
react-hook-form@7.86.0, lucide-react@1.33.0, axe-core@4.13.0, @axe-core/playwright@4.13.0,
@tanstack/react-router@1.170.27, @tanstack/history@1.162.1, @tanstack/router-core@1.171.22,
playwright-core@1.62.1)
```

The harness reproduces the walk, the exclusions, the own-basename filter and the
registered → own → finding ordering, and reports **0 findings / 151 refs seen** with today's
patterns. So it is measuring the same thing the gate measures.

## The three treatments

| Treatment                                       | Findings | Refs seen | Spec's estimate |
| ----------------------------------------------- | -------: | --------: | --------------: |
| **A** — patterns widened, `git ls-files` not    |   **94** |       245 |            ≈ 91 |
| **B** — both widened                            |    **7** |       245 |               5 |
| **C** — B plus the `auth.css` foreign exclusion |    **4** |       245 |               2 |

**A is the number that decides D1.** Widening only the patterns — the obvious edit — turns 94
citations of this repository's own `globals.css`, `PrintSurface.css` and `GanttPrintSurface.css`
into gate failures, because `ownJsBasenames()` lists JavaScript and cannot exclude a stylesheet.
That is ADR-0058's fails-on-day-one gate, and it confirms the spec's central claim with a bigger
number than the spec predicted.

**B is 7, not 5, and C is 4, not 2 — the difference is this epic's own artefacts**, which the spec
predicted in the abstract and under-counted in the particular:

```
auth.css:110              <- docs/adr/0077-…
auth.css:99-104           <- apps/web/src/components/ui/alert.test.tsx
auth.css:99-136           <- docs/DESIGN_SYSTEM.md, docs/adr/0077-…, alert.tsx
lucide-react.d.ts:342     <- docs/specs/workspace-modes/feature-spec.md  (+ this epic's two)
preflight.css …202-205    <- this epic's spec and plan   ← the SAME claim, cited twice
preflight.css:202-206     <- this epic's spec            ← …with two different ranges
useBlocker.d.ts:35        <- docs/specs/unsaved-work-guard/{feature-spec,implementation-plan}.md
```

**And that surfaced a defect in the spec itself**, which is the useful part of running the harness
rather than trusting the estimate: the spec cited the Preflight rule at **two different line
ranges** — `202-205` in its colon form and `202-206` in its prose form — so one claim produced two
refs, and registering either would leave the other demanding an entry. The register keys on
`basename:lines`, so an inconsistent citation of one fact is two facts as far as the gate is
concerned. M1 normalised the spec to `202-206` (the whole rule, closing brace included, per M0-T2)
and registered that one.

The first line above is deliberately written with a space rather than a colon. Once M1 lands, this
file is itself a scanned input, and spelling the withdrawn ref in its recognised form would demand
a register entry for a citation that exists only to describe a mistake. The spec predicted that
trap in the abstract; this is it in the particular, and it is the same reason
`scripts/check-claims.mjs` excludes itself from the scan.

**Below the threshold, so arm directly.** The plan's pre-agreed split at 15 findings does not fire
at 4 (or at 7 before the foreign exclusion), so M1 lands the widening armed rather than report-only.

## M0-T2 — the three cited locations, read

Each resolved **through the workspace link**, not the store, and each store checked to hold exactly
one matching directory so neither the conflict nor the ambiguity branch of `resolve()` can fire.

**`tailwindcss@4.3.3`** (`apps/web/node_modules/tailwindcss/package.json`; the store holds exactly
one `tailwindcss@…`). The stylesheet is `preflight.css` at the package root — **not** the
`preflight/` sub-path the spec's prose assumes elsewhere. Lines 199–206:

```
199-  Make lists unstyled by default.
200- */
201-
202- ol,
203- ul,
204- menu {
205-   list-style: none;
206- }
```

So the claim ADR-0122 rests on is exactly true, and the citable range is **202–206** — the whole
rule including its closing brace. Anchor: `list-style: none;`.

**`@tanstack/react-router@1.170.27`** → `dist/esm/useBlocker.d.ts:35`:

```ts
    enableBeforeUnload?: boolean | (() => boolean);
```

Which is the property `docs/specs/unsaved-work-guard/implementation-plan.md:80` calls _"the single
most consequential claim in the design"_ — and it has been unregistered the whole time while its
seven `useBlocker.js` siblings are registered, purely because those end `.js`.

**`lucide-react@1.33.0`** → `dist/lucide-react.d.ts:342`:

```ts
declare const AlignHorizontalJustifyStart: react.ForwardRefExoticComponent<…>;
```

`docs/specs/workspace-modes/feature-spec.md:180` names version **1.28.0** and the icon
`AlignHorizontalJustifyStart`. The citation **still holds**, at the same line, across five minor
versions — by coincidence, not by anything checking. That is `docs/TECH_DEBT.md` **#181** in
miniature and the argument for the `anchor` field: the anchor is what would have caught a drift the
`ref` cannot see.

## What the harness is not

A throwaway. It lives in the scratchpad, not the repository: its value is these numbers, and a
second copy of the walk kept alive beside the real one is exactly the drift this gate exists to
catch, one level up.

## M1 — the five red runs, observed

ADR-0110 D5: a gate is finished only when the defect it names has made it fail. Each was run against
the shipped code and its output read, not reasoned about.

| #   | What was broken                                                      | Result                                                                         |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | **D1's proof** — patterns widened, `git ls-files` reverted           | **87 findings**, nearly all this repository's own stylesheets                  |
| 2   | `FOREIGN_UNVERIFIABLE` emptied                                       | fails naming the three `auth.css` refs                                         |
| 3   | The Tailwind claim deleted from the register                         | fails naming `preflight.css:202-206` **and `TsldPanel.tsx` as its citer**      |
| 4   | Its anchor corrupted to `list-style: disc;`                          | fails with "the anchor is no longer at …", so the anchor half works on CSS too |
| 5   | A fabricated `.cjs` ref (`made-up-dep.cjs` …12-14) in a scanned file | demanded — `.cjs` is genuinely inside the class now                            |

**Run 1 is the one that matters**, and it is the whole argument for D1 in one number: widening only
the obvious half produces 87 failures, all of them noise, on the first run. (The harness measured 94
before the three claims were registered and the foreign exclusion added — the seven-finding
difference is exactly those.) A gate that fails that way on day one gets deleted rather than fixed.

Run 3's output is worth reading rather than summarising: it names `TsldPanel.tsx` as a citer, which
it could not have done yesterday. That call site's comment used to say the version was named there
_"rather than pinned by `pnpm check:claims`, because that gate's citation patterns match `.js`/`.mjs`
only and structurally cannot see a CSS claim"_. It now is pinned, and the comment says so instead.

**And run 5 caught this file twice.** Writing that row in the recognised form re-created the very
citation the run had removed, so `pnpm prepush` failed on it — the third time in this epic that a
document describing the notation became an input demanding a register entry for its own
illustration. It is now spelled with a space, like the withdrawn `202-205` above. That is exactly
why `scripts/check-claims.mjs` excludes itself by name, and the argument for keeping that exclusion
narrow rather than growing it: the alternative is a gate nobody can write about.
