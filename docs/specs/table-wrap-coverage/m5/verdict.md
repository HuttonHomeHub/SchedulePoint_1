# M5 — the verdict, and the condition that failed

**Taken:** 2026-09-19. Every number below is from **one sitting** on one pair of dev servers against
`app_test`, and each is labelled with the tenant it came from. Where a figure is quoted from an
earlier milestone it says so, because `m2/README.md` §2 records three candidate readings that did
not reproduce across sittings and this file exists partly so that cannot be repeated silently.

**Headline: FC-4 FAILED and the remedy shipped anyway, with the failure recorded and the column
declared.** That is not a reinterpretation of the bar — the bar is quoted verbatim below and it is
not met. What changed is that M5's UX review asked a question nobody had asked, the fixture was
widened to answer it, and the answer falsified a condition three milestones old.

---

## 1. What the UX review found, and why it mattered

> None of the seven candidates in `m2/README.md` §3 were re-measured against a longer real address
> or a longer role.

Correct, and the consequence was larger than it looks. **Every reading behind FC-4 came from one
easy shape**: an address of the form `invited-<13 digits>@example.com` (33 characters) and the role
`Planner` (7 characters, the shortest but one of the four `ROLE_LABELS`). The fixture had never
contained anything else, so the gate had never been asked the question the product will be asked on
its first real day.

The fixture is now widened permanently (`composition.spec.ts`, the `beforeAll` seed): a second live
invitation carrying `c.fitzwilliam-hargreaves@construction-partners.example.com` (58 characters) and
`ORG_ADMIN`, which renders `Org Admin` — the longest label `ROLE_LABELS` can produce, and therefore
the widest the `fit` Role column can ever be asked to hold. **A gate measures what it is given.**

---

## 2. FC-4 — the chosen remedy actually fits: **FAIL**

> **Bar:** at **1280, 1646 and 1920**, **zero** wrapped cells in the Pending invitations table —
> **without** declaring any of its columns `auto` to achieve it.

**Not met at 1280.** Measured on the shoot tenant `shot-co-1789843539195`, one sitting, by the
journey's own detector (clone at the cell's width, measure, force `nowrap`, measure again):

| Fixture                 | Role column | Email column | 1280 Email    | 1646 Email | 1920 Email |
| ----------------------- | ----------- | ------------ | ------------- | ---------- | ---------- |
| `Planner` only          | **65px**    | **280px**    | no wrap       | no wrap    | no wrap    |
| `Planner` + `Org Admin` | **82px**    | **263px**    | **both wrap** | no wrap    | no wrap    |

Raw heights at 1280 with both roles present: the 33-character address clones to **92px wrapped
against 71px nowrap**, the 58-character one to **92px against 55px**. With `Planner` alone the same
cell reads **71px wrapped, 71px nowrap** — identical, i.e. no wrap.

**So the whole difference is 17px, and it is the width a longer role label takes from a `fit`
column.** `fit` shrink-wraps to its widest cell; `Org Admin` is 17px wider than `Planner`; Email
loses exactly that and falls from 280px to 263px, which is the boundary for a 33-character address.

**M3's FC-4 PASS therefore held only because every seeded invitation was a Planner** — including for
the short address it judged clean. `m3/README.md:7` is annotated in place rather than rewritten.

### What shipped instead

`Email` is declared **`width: 'auto'`**, with the measurement above written into its docblock. This
is the vocabulary working rather than an escape from it: ADR-0146 D3's rule is that `auto` means
somebody decided a column may wrap **and said why**, and an email address is _unbounded by the data
model_ — there is no width that can promise it one line, and the only alternative, truncation, hides
the reader's own data. The gate now prints it as a tolerated wrap rather than passing silently:

```
wrap sweep: 24 screen-widths examined, 9 declared-auto wrap(s) tolerated, 0 finding(s).
  tolerated: members@1280 Email (auto) "invited-1789843784463@example.comSent 19"
  tolerated: members@1280 Email (auto) "c.fitzwilliam-hargreaves@construction-pa"
```

Members is clean at **1646 and 1920** and tolerated only at 1280. The break falls at punctuation,
never mid-token (`invitations-live-1280.png`), which is the distinction between a legitimate wrap
and a broken value.

### Two options considered and not taken

- **Moving the table to the grid's wide span at 1280.** ADR-0146's rule is spans by content demand,
  and 454 natural against a 416px track would justify it. Not taken: it re-opens the whole Members
  composition for one column at one width, and **it would not remove the declaration**, because a
  long enough address wraps in the wide track too.
- **Making `Role` not `fit`.** Rejected on the arithmetic: an `auto` Role shares width and can then
  wrap `Org Admin` across two lines, which is strictly worse — a four-value vocabulary is exactly
  what `fit` is for, and the 82px is simply what the longest label costs.

---

## 3. FC-5 — the remedy costs no other screen any width: **PASS (clause 1)**

Clause 2 is conditional on C1 being chosen and **C1 was not chosen**, so it does not apply.

Clause 1, measured this sitting by `measure-page-drift.mjs` at all three widths against the shoot
tenants `shoot-co-1789835128448-{1280,1646,1920}` — `m5/drift-{1280,1646,1920}.json` against the M0
baseline (`m0/drift-*.json`, sha `2f256848`):

| Width | Screens compared | Narrower | Overflowing |
| ----- | ---------------- | -------- | ----------- |
| 1280  | 11               | **0**    | 0           |
| 1646  | 11               | **0**    | 0           |
| 1920  | 11               | **0**    | 0           |

Every screen's `mainWidth` is byte-identical to its baseline (1003 / 1369 / 1643 for the nine
org-scoped screens; 1280 / 1646 / 1920 for the two full-bleed ones). That is expected rather than
lucky: **`WIDTH_CLASSES.auto` is `''`** (`data-table.tsx:106` — read from the declaration, not from the docblock
40 lines above it that asserts the same thing), so declaring a column `auto` changes the `data-col-width` attribute and **no pixels at
all**. The reading is taken anyway, because "it cannot have changed anything" is an argument and
FC-5 asks for a number.

**`staff` reports no `mainWidth` on either side.** Consistent, therefore not a regression — but it
means this harness has never measured that screen, which is worth knowing before anyone cites it.

### A stale citation, corrected in place

FC-5's **Baseline** names `m3/drift-1646.json`. **That file does not exist and never did** — M3
produced `cf-{1280,1646,1920}.json` and `tracks-1280.json` only. The epic's drift readings are
`m0/drift-*.json` (pre-remedy) and `m2/drift-1646-{baseline,C2c,C3}.json` (the candidate sitting).
The condition was written when the plan expected M3 to take a drift reading; it did not, and nothing
noticed, because nothing reads a baseline citation until somebody tries to judge against it.
`falsification.md` is corrected in place.

---

## 4. FC-6 — reflow at 320px is unchanged: **PASS**

Confirmed in the **same sitting** by the journey rather than by a separate harness:
`no list screen overflows a 320px viewport` passed in the run of
`scripts/e2e-local.sh web:page-composition` that also produced the wrap-sweep output quoted in §2 —
14 passed, 0 failed. The drift readings above independently report `overflowsBy: 0` on all 11
screens at 1280, 1646 and 1920.

---

## 5. The photographs, including the branch nothing had ever shown

`m2/README.md:214-215` recorded the `Expired` branch as unphotographed and covered only by a unit
case. It is photographed now, on the shoot tenant with one row expired and one live so the contrast
is visible in one frame:

| File                           | What it shows                                                   |
| ------------------------------ | --------------------------------------------------------------- |
| `invitations-live-1920.png`    | both rows live; both addresses on one line                      |
| `invitations-live-1646.png`    | both rows live; the 58-character address still on one line      |
| `invitations-live-1280.png`    | both rows wrap, at a hyphen, each fact whole                    |
| `invitations-expired-1920.png` | `Expired` badge inline after the sent date, live row beneath    |
| `invitations-expired-1646.png` | same at the product owner's width                               |
| `invitations-expired-1280.png` | the expired row is **shorter** than the live one (79px vs 91px) |

The last is the reassuring arithmetic behind the branch: `Expired` is a badge and
`Expires 26 Sept 2026, 18:45` is 27 characters, so the expired branch is strictly the **narrower**
case and cannot be the one that breaks a layout the live branch survives.

---

## 6. Three corrections to this milestone's own work

1. **The first widened fixture used `c.fitzwilliam-hargreaves+${Date.now()}@…`**, out of habit, and
   the timestamp took the address to **72 characters** — which wraps at 1646 as well as 1280, and
   would have made the whole reading a statement about an address shape nobody has. The stamp is
   unnecessary: `uq_invitations_org_email_pending` is scoped to `organization_id` and the journey
   mints a fresh organisation every run (`composition.spec.ts:22-23`). Removed, and the reason is in
   the fixture.
2. **The 1646 finding was briefly suspected to be an instrument defect**, because the photograph
   showed the address on one line while the gate reported a wrap. It was not: the photograph was of
   the 58-character address and the gate had measured the 72-character one. Established by running
   the detector and printing wrapped-vs-nowrap heights beside the live `getBoundingClientRect`,
   rather than by reading either. The detector is sound and unchanged.
3. **The first drift comparison reported "0 screens narrower" having read one key.** It looked for
   `contentWidth`/`width` and the probe emits `state.mainWidth`, so it matched only `run.width` —
   viewport against viewport — and produced a clean verdict from a comparison of nothing. Caught
   because 12 screens cannot produce one row. The numbers in §3 are from the corrected reader.
