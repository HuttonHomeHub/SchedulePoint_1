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
