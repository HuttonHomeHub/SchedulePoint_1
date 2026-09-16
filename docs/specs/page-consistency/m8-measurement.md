# M8 — the gate pass

**Status:** Approved
**Date:** 2026-09-16
**Decision record:** [ADR-0145](../../adr/0145-a-screen-is-assembled-from-the-archetypes.md)

Six specialists over the combined diff (`b85a6d31..HEAD`), each given the epic's own measurement
files and asked to re-derive rather than accept. Two passed with nothing blocking; four blocked, on
**seven defects that had passed a human read**. Every fix below carries a regression test verified
red against the specific defect it guards (ADR-0110 D5).

## 1. The reviews

| Review                 | Verdict                | Blocking findings                                                    |
| ---------------------- | ---------------------- | -------------------------------------------------------------------- |
| api-reviewer           | pass-with-nits         | 2 (one a live lint failure, one a missing doc the plan committed to) |
| backend-performance    | **pass** (no blocking) | 0 — two wording corrections, both to claims of mine                  |
| component-reviewer     | pass-with-suggestions  | 0 blocking, 2 acted on                                               |
| ux-reviewer            | **blocked**            | 1                                                                    |
| accessibility-reviewer | **blocked**            | 3                                                                    |
| (CQ-3 answered)        | —                      | unblocked M5-T3                                                      |

## 2. The largest finding: the epic's own subject, landing on it

All ten M5 submit conversions shipped **without**
`className="aria-disabled:pointer-events-none aria-disabled:opacity-60"`. Raised independently by
ux and accessibility.

`Button`'s CVA base is `disabled:pointer-events-none disabled:opacity-50` — Tailwind's `disabled:`
variant, which fires on the **native attribute only**. So the swap removed the attribute _and every
visual consequence of it_: pressing Save changed the label to "Saving…" and nothing else. The button
stayed at full opacity and fully hoverable for the whole request.

Re-derived with a comment-stripping, brace-balanced scan rather than accepting the reported count:

|                                         | sites                                                        |
| --------------------------------------- | ------------------------------------------------------------ |
| submit buttons carrying `aria-disabled` | 23                                                           |
| …missing the class pair                 | **17**                                                       |
| …of which the epic's own conversions    | 10                                                           |
| …of which **pre-dated the epic**        | **7** — `ActivityCreateDialog` and all six public auth forms |

All 17 fixed. The auth six are the sharper half: `/sign-in` is the front door (ADR-0077), and
pressing **Sign in** there gave no feedback at all beyond one word changing.

### 2.1 Two defects in the gate that should have caught it

`submit-guard.structural.test.ts` asserted the native attribute is **absent** and nothing about the
class pair — the easy half of a two-part rule. It now asserts both.

Its tag reader also had a hole. `/<Button\b[^>]*?>/` ends at the first `>`, and
`onClick={(event) => …}` supplies one at what looks like tag level, so **anything written after the
guard was invisible to the gate**. Every site this gate exists for is written in exactly that shape;
the attribute it looks for happened to sit _before_ the arrow at all ten, which is why the hole was
invisible. Measured against the old matcher:

```
OLD reader, arrow fixture   -> 0   (gate expects 1)
OLD reader, comment fixture -> 1   (gate expects 1)
```

The arrow-function fixture therefore **discriminates** and is pinned as one. The comment fixture
does **not** — comment-stripping was there from the start — and is kept as a regression pin on that
stripping and labelled as such, rather than presented as a second defect found. Stating the
difference is the point: two fixtures that look alike, one of which proves nothing new.

## 3. D5's central claim, probed and false

M3 shipped the relocated coverage rule inside a `<details>`, with the claim that
`aria-describedby` resolves into a closed one labelled **_reasoned from specification, not
observed_** — the honest label ADR-0083 and ADR-0122 carry. Probed in Chromium over CDP
(`Accessibility.getFullAXTree`):

```
COLLAPSED   description = null
EXPANDED    description = "The coverage rule, which is the fact a reader cannot infer."
```

Two further probes established the discriminator rather than assuming it: the description **does**
resolve to an `sr-only` (clipped) element, and **does** resolve to a `hidden` one. What defeats it
is specifically a closed `<details>`'s skipped subtree, not invisibility as such.

So the rule was announced **only once it was already visible**, which is the one state in which it
needs no announcing. `CoverageDisclosure` replaces it: a button with `aria-expanded` /
`aria-controls` over content that is always in the DOM and `sr-only` while collapsed.

**And the guard beside it had gone vacuous.** `caveat.closest('details')` was a meaningful
assertion while the disclosure was a `<details>` and became **unconditionally true** the moment it
stopped being one — a test that keeps passing while no longer able to fail, which is the one failure
mode a green suite cannot report. Rewritten to ask the disclosure's controlled element, and verified
red by moving the caveat inside it.

## 4. The other five

| #   | Finding                                                                                                                                  | Fix                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `clients.service.ts:6` — **live `import/order` lint error**; `pnpm --filter @repo/api lint` failed                                       | reordered. `pnpm prepush` would have caught it and had not been run since M7                                                                  |
| 2   | Clients search **announces nothing** (WCAG 4.1.3) while both sibling library tables have announced their settled count since ADR-0053 M6 | `useResultCountAnnouncement`, keyed on the debounced term                                                                                     |
| 3   | The empty state's `Clear filters` **drops focus to `<body>`** on clients, calendars and resources                                        | focus the always-mounted region. The _bar_ copy deliberately does not — it stays mounted and shaded, so focus belongs where the reader put it |
| 4   | CQ-3 answered ⇒ **M5-T3, the eleventh submit site** (`MembersTable`'s role `<select>`)                                                   | `aria-disabled` + `aria-busy` + an `onChange` guard                                                                                           |
| 5   | `docs/API.md` never told that the clients list takes a `q` — a step the approved plan named                                              | written                                                                                                                                       |

**On #3, the asymmetry is the decision**, not an oversight in the other direction: the two buttons
run the same clear and have different focus obligations, because only one of them removes itself by
succeeding.

**On #4**, this is ADR-0083's **button** clause and not its field clause, and the discriminator is
which kind of unavailability it is: the field clause governs a control _gated_ by a permission or a
prerequisite, where the loss is readability; this control blocks **itself during its own mutation**,
where the loss is operability. `aria-busy` rides alongside — the reviewer's refinement — which
answers ADR-0083's own "false announcement" objection by having a reader hear that the control is
working rather than a bare, briefly untrue "disabled".

## 5. What the passing reviews corrected

backend-performance found nothing blocking and **re-derived the M7 measurement on a clean Postgres
16**, which corrected two claims of mine:

- **190× → 40×.** 5,000 / 124 is 40. An arithmetic slip in a checkable number, in two places.
- **The scan method was wrong, and the number survives.** `client.repository.ts` and
  `m7-measurement.md` both justified the cost with "a bitmap scan bounded to one tenant" — a
  sentence inherited from ADR-0053 M4, true of _that_ measurement's table composition (target tenant
  at 20.8% of the table) and not of this one. Measured, the planner **seq-scans the whole table**
  while the tenant is a majority share and switches to the org-bound bitmap plan only below roughly
  a 25–33% share — and **the deployed database is in the seq-scan regime today**, one organisation
  holding 123 of 124 clients.

  | other-org rows | total  | target share | plan             | time    |
  | -------------- | ------ | ------------ | ---------------- | ------- |
  | 0              | 5,000  | 100%         | Seq Scan         | 2.34 ms |
  | 5,000          | 10,000 | 50%          | Seq Scan         | 4.75 ms |
  | 10,000         | 15,000 | 33%          | Seq Scan         | 6.97 ms |
  | 15,000         | 20,000 | 25%          | Bitmap Heap Scan | 2.53 ms |
  | 45,000         | 50,000 | 10%          | Bitmap Heap Scan | 2.68 ms |

  Every point is two orders inside CLAUDE.md §15's 200 ms budget, and the candidate index changes
  nothing in **either** regime. The verdict is unchanged and now rests on the right thing: the
  escalation trigger is phrased on a single organisation's row count, which is why it survives a
  correction to the plan shape. `#336`'s remedy was independently confirmed — `gin(name
gin_trgm_ops)` serves `name ILIKE` at 0.035 ms; `gin(lower(name) gin_trgm_ops)` is never used.

api-reviewer separately confirmed that the **absence** of a per-endpoint 422 declaration is correct
rather than an omission: every list route in the estate relies on `docs/API.md`'s blanket
`ValidationPipe` rule, and the calendar exemplar declares none either.

## 6. The drift the reviews found in the register itself

ADR-0145 was filed, **Accepted**, present in `docs/adr/README.md` and cited by `docs/ROADMAP.md` —
and **absent from `CLAUDE.md` §16**. That is the ADR-0071 failure `docs/TECH_DEBT.md` #291 records
happening three times already, and `check:adr-coverage` structurally cannot see that file, so
nothing failed. Found by the component review, not by anything automatic.

Two documents the spec promised were missing with it (`docs/DESIGN_SYSTEM.md`'s row-action threshold
and the class-pair rule; `docs/UX_STANDARDS.md`'s row-action threshold and the persistent-clear
rule), and both are now written — which is the point of §5 of the spec: they exist so the _next_
table is not a judgement call.

## 6b. The gate nobody ran, and what it had been holding

**`pnpm prepush` was not run once between M1 and M8**, and the first complete run of this epic
found **49 lint errors in `apps/web`, every one of them this epic's**:

| Source                                                                                                   | Errors             |
| -------------------------------------------------------------------------------------------------------- | ------------------ |
| `import/order` — the M4 `RowActionsMenu` imports and M8's `CoverageDisclosure`                           | 26 across 13 files |
| `no-undef` — the two M0 harnesses' browser-context `probe()` functions                                   | 27 across 2 files  |
| `@typescript-eslint/no-duplicate-type-constituents` — `context?: string \| undefined` on a **parameter** | 1                  |

None of it was pre-existing: `git diff b85a6d31..HEAD` touches neither `apps/web/eslint.config.js`
nor `packages/config`, and the one sibling harness that looked implicated
(`measure-staff-history.mjs`) lints clean on its own, carrying the per-line `no-undef` disables the
new pair lacked. That last point is worth stating because the first attribution was **wrong**: a
`grep -B2` over eslint's text output assigned those errors to the wrong file, and only a
`--format json` pass gave a per-file count. An instrument reporting a filename it did not measure is
this epic's own §2.1 finding in miniature.

**The cause is §19.8 exactly.** That section says the gate is **one command** and that running its
parts by hand is how a gate gets missed — and across seven milestones the parts were what ran:
targeted `vitest` runs, `tsc --noEmit`, individual `check:*` scripts. `pnpm lint` was never among
them. It did not surface in CI either, and that is not CI's fault: `main` carries no branch
protection (§8), so the `quality` job reports and cannot block, and **§19.9 is the only merge gate**
— a person reading the check runs. This epic reached its merge boundary with nothing having read
them yet.

The two harnesses' fix is scoped rather than blanket: a `/* eslint-disable no-undef */` around the
**one browser-context function** in each, with the Node half above and below it keeping the rule.
A file-level disable would have been shorter and would have switched the rule off for the Playwright
driver code that is the rest of the file.

**`check:reconcile-due` also WARNed on the same run** — 8 ADRs filed since the 2026-09-11 pass,
against a threshold of exactly 8 (ADR-0120's T = 8, derived from p75 = 7.50). It is advisory by
design and is recorded here rather than actioned inside this epic: a reconciliation pass is its own
work under §21, and folding one into an epic's last milestone is what ADR-0105 exists to stop.

## 6c. The sweep, and the two findings nothing else could reach

The full 43-suite sweep had not run since M4. It was run in full: **44 suites, 41 pass, 3 fail** —
and the three are worth reading together, because they are three different kinds of wrong.

| Suite              | Verdict                   | Subject                                              |
| ------------------ | ------------------------- | ---------------------------------------------------- |
| `public`           | **the product was wrong** | a defect introduced by this very gate pass           |
| `recently-deleted` | **the test was wrong**    | a locator, and a docblock this epic had made false   |
| `staff`            | **flake**                 | re-run alone: 3 of 3, including the case that failed |

### The product one: a gate written the same day, wrong for one of its seventeen subjects

`public` failed at **all six viewports** on `/verify-email`:
_"primary action is covered by another element"_. `e2e-public/support.ts:189-193` takes
`document.elementFromPoint` at the button's centre and asserts the hit is the button —
and `pointer-events: none` makes that call return the element **behind**, so the check was correct
and the button genuinely was not pointer-reachable.

§2's fix added `aria-disabled:pointer-events-none aria-disabled:opacity-60` to all seventeen
guarded submits. Sixteen bind `aria-disabled` to `mutation.isPending` — **transient**, about a
second — where inertness to the pointer is exactly right. `ResendVerificationButton` binds
`send.isPending || address.trim() === ''`, so on `/verify-email` reached **without `?email=`** — a
bookmark, a retyped URL — it is `aria-disabled` **at rest, from first paint**. The result was that
the only route back into an unverified account became pointer-unreachable in its resting state:
the dead end ADR-0074 and ADR-0077 exist to close, and the exact inverse of that component's own
rule that _"a button that silently does nothing is worse than a field"_.

**The discriminator is not in the tag and cannot be** — _is the `aria-disabled` expression
transient, or can it be the control's resting state?_ — so the gate takes a **named exception with
its reason** (`POINTER_EVENTS_EXEMPT`) rather than a loosened regex, in the shape
`dependency-claims.json` and `flag-retirement.json` already use and ADR-0083's "a named exception
with its cost stated". Two pinned cases prove it discriminates **both ways**: the resting shape
passes for the file that owns the exemption and still fails for a dialog that never asked for it.
A third asserts every exemption names a file that exists and a reason of substance, so a rename
cannot leave the rule silently unenforced.

**This is ADR-0081's argument landing on this epic's own instrument.** A structural gate written
hours earlier enforced a rule correct for 16 of 17 subjects, every unit test stayed green, and the
thing that caught it was a journey driving the real product in a real browser.

### The test one: a docblock this epic made false

`recently-deleted` timed out on `getByRole('button', { name: 'Delete Northgate' })`. That button
does not exist: **M4 moved Delete behind the `⋯` menu on all five tables**, which is the shape the
product owner chose. The helper's docblock is the more instructive half — it read _"The tables
render Edit/Delete buttons directly rather than a row menu"_, true when written and made false by
this epic, so it asserted the opposite of the code in the file a later reader would most trust.
Corrected rather than merely rerouted (ADR-0058).

`context` becomes a **required** argument (`Clients`, `Plans`) because the Project Explorer names
its own node menus `Actions for <name>`; without the qualifier the locator resolves to two elements,
which is ambiguity rather than failure and the harder thing to read. `e2e-audit` had already been
updated at M4 and passed throughout — so the fix was applied to one suite and not its neighbour,
which is this register's most-recorded shape, in the sweep's own findings.

### The instrument that lied about all of it

`pgrep -f "e2e-sweep"` **matches its own command line**. Two consequences, both live:

- it reported a sweep **alive that had never started** (`sweep2.log` did not exist), and
- every wait-loop written `while pgrep -f "..."; do sleep; done` **can never exit** — which is why
  two monitors expired reporting _no events_ rather than a verdict. Those expiries read as "nothing
  has happened yet" and meant "this instrument cannot finish".

The bracket-class trick (`[e]2e-sweep`) does not rescue it when the pattern text is itself on the
command line. The check that worked is **content in the log** — the sweep's own `SWEEP-DONE`
marker, which was read correctly at exactly the moment `pgrep` was insisting the finished sweep was
still running.

## 7. Filed rather than fixed

- **#338** — two hand-rolled `<details>`, two `<summary>` treatments. Both pre-date the epic; a
  third, or a second consumer of `CoverageDisclosure`'s shape, is the ADR-0105 trigger to build a
  primitive.
- **#339** — `SectionCard`'s description has no measure, which is character-for-character the shape
  `PageHeader` had before M1. Not visible today (one live consumer), and the fix is not a copy of
  M1's two classes, because `CardDescription` is shared with every `Card` in the estate.
- **#57** gains a note: the `apiFetchAllPages` + Prisma disjunctive-cursor cost recurs at every such
  consumer rather than only the recycle bin. Measured here at 0.15 ms (depth 20) / 0.93 ms (depth
  4,900) — real, immaterial at this product's scale, and unchanged by M7.

## 8. What CI found that the local gate could not, and the budget it moved

Two jobs went red on the first CI run of the epic's branch (`a67ceeac`), and **neither was a test
failure**.

**Shard 2 of the web end-to-end matrix** ran every suite green or skipped and then died at step 56,
`Upload Playwright report`: `Failed to FinalizeArtifact: Received non-retryable error: Failed
request: (403) Forbidden: Error from intermediary with HTTP status code 403 "Forbidden"` — after
`Uploaded bytes 2743051` and `Finished uploading artifact content to blob storage!`. The artefact
had transferred; the finalize call was refused by something between the runner and the artifact
service. Nothing in this repository causes it and nothing here fixes it. Established by reading the
job's step list rather than by re-running and hoping: fifty-five test steps, every one `success` or
`skipped`, one `failure`, and it is the upload.

**`check:bundle-size` is the real one, and the honest framing is not the one the failure invites.**
It reported the entry graph at 416.58 kB gzip against a 416.00 kB budget, over by 0.58 kB. The
tempting reading is that this epic is heavy. It is not, and the numbers say so:

| build                       | entry graph gzip      | against the 416.00 kB budget |
| --------------------------- | --------------------- | ---------------------------- |
| `origin/main` at `b85a6d31` | 415.82 kB (425,798 B) | **0.18 kB of headroom left** |
| this branch at `a67ceeac`   | 416.58 kB (426,581 B) | over by 0.58 kB              |

So the epic adds **0.76 kB** to a budget that was already 99.96 % spent. Both builds were taken on
one machine in one sitting, and the gate reproduces the CI figure to the byte locally, so this is
not a CI artefact.

**What the gate exists to ask was asked and answered.** Its whole purpose is to catch a library
arriving in the first paint, so the two reports' entry graphs were compared rather than their
totals: the package set is **identical** — 26 either side, none new, none gone — and `paint.js`
(39,889 B) and `rolldown.js` (368 B) are byte-identical. The entire +783 gzip bytes is application
code in `index.js`. That is precisely what `headroomRatioIsAJudgement` describes as "room for an
ordinary feature without a conversation".

The budget is therefore **re-floored rather than nudged**. A raise of 0.58 kB would leave the next
change red on the same line, and a gate that fires on every push is one that gets bypassed rather
than obeyed (ADR-0058). The floor is re-measured against `main` — never against the branch, or the
change under test sets its own bar — and each budget re-derived by the rule the 2026-09-11 numbers
were derived by, the smallest whole kB at or above floor × 1.05. Only the entry graph moves, to
**437 kB**; 1.05 × today's CSS and largest lazy chunk round to the whole kB they already held.

Three things are worth carrying out of it.

- **The 2026-09-11 floor's spend is recorded in prose, not in a key.** `runGate`'s B7 reads a fixed
  key set and refuses an unknown one, so the `previousFloor` block this was first drafted as would
  have failed the gate it was being written for. It lives in `floor._` instead.
- **Re-flooring against `main` makes the summary line mean something again.** It read "+20.56 kB
  since the floor was measured" — five days and eight ADRs of accumulated growth, in which a
  branch's own contribution is invisible. It now reads **+0.76 kB**, which is this epic's.
- **This gate is deliberately outside `pnpm prepush` and that is not a §19.8 miss.** Its own
  docblock gives the reason: it needs a production build, and making every push wait on one is how
  a gate gets bypassed. It is a CI-only gate by design, and `check:ci-roster` excludes it
  explicitly from both sides. The instinct to file this as the `check:adr-coverage` failure of
  earlier in the same session was wrong, and checking the docblock rather than acting on the
  instinct is the only reason it is not recorded here as one.
