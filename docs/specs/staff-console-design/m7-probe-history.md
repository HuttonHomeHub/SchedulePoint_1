# M7 — the reading history, measured before it is redesigned

**Status:** Approved
**Taken:** 2026-09-15, Chromium, 1646 × 1000, the local e2e database (15 accumulated sittings).
**Instrument:** `apps/web/scripts/measure-staff-history.mjs`, five controls, all PASS.

The product owner used the released console and said the reading history is "a massive list, with
copy report on each one", and asked whether the last report plus a dropdown would be better. The
shape they asked about was adjusted on discussion (§5) and the height claim is measured here,
**before a line of the remedy is built** — because this repository has now withdrawn seven
consecutive height expectations on their own measurements, and an eighth would surprise nobody.

## 1. Why the last epic's numbers could not answer it

ADR-0143's M0 baseline was taken with **zero readings recorded** — its §2 describes the panel as
rendering "No readings recorded yet" — so the 3,690 px figure contains no sitting block at all.
M6's 12,696 px **was** taken over an accumulated history, and its §4 says so honestly ("roughly
fifteen accumulated sittings … FC-2's ratio is not portable"), but it never separated that history
from the rest of the page. Neither number answers _how tall is the list_, which is the only
quantity this decision turns on.

## 2. The measurement

| quantity                               |                                       measured |
| -------------------------------------- | ---------------------------------------------: |
| Document height                        |                                  **12,842 px** |
| …in viewport heights (1000)            |                               **12.8 screens** |
| Performance panel, whole card          |                                       8,775 px |
| **The sittings list alone**            |                                   **8,487 px** |
| **…as a share of the document**        |                                     **66.1 %** |
| Everything else on the page (7 panels) |                                       4,355 px |
| Sitting blocks rendered                |                                         **15** |
| "Copy report" buttons                  |                                         **15** |
| Block height — min / median / max      |                             303 / 429 / 765 px |
| Widest table                           | 1,438 px (the post-ADR-0143 two-column screen) |

**Two thirds of the staff console is one panel's history.** The other seven panels together — the
status summary, mail and retention, CSP, unverified accounts, installation, diagnostics and staff
activity — are 4,355 px between them.

### 2.1 A control the harness did not have, and the correction it produced

The DOM renders **15** blocks. The first database query written to check that reported **19**,
by grouping single presses on the row id. `sitting.ts:314` groups them by `run_id`, and a single
press of a two-limb scenario stores two rows under one — so re-grouped by the client's own key the
database says **15**, exactly. The product was right and the arithmetic against it was wrong; it is
recorded because a 19-against-15 disagreement left unexamined is how a false finding gets filed.

## 3. Where the 8,487 px goes — and it is not the readings

Measured per block (`heading` / `facts` / `table region`):

| block                   |  total | heading |   facts |  table | readings |
| ----------------------- | -----: | ------: | ------: | -----: | -------: |
| Sweep of 6 readings     | 765 px |   20 px | **140** | 537 px |        6 |
| Sweep of 6 readings     | 757 px |   20 px | **140** | 529 px |        6 |
| Sweep of 2 readings     | 485 px |   20 px | **140** | 201 px |        2 |
| One reading (two limbs) | 429 px |   20 px | **140** | 201 px |        2 |
| One reading (one limb)  | 303 px |   20 px | **140** |  75 px |        1 |

**The facts list is 140 px on every block, whatever the block holds** — six `<dt>/<dd>` pairs
naming the machine, the canvas, the display interval, the attention state, the versions and the
operator. Fifteen of them is **2,100 px, a quarter of the list**, and on a one-reading block the
facts are nearly twice the height of the reading they describe.

Add 15 headings (300 px), 15 Copy buttons (~540 px) and the `space-y-8` gaps (~450 px) and roughly
**3,400 px of the 8,487 is per-block chrome** rather than measurements. That is the finding the
complaint is pointing at, and it is what makes the collapse work: an index row has to carry those
same facts in one line, not omit them.

## 4. What the remedy must clear — committed before building

Derived, not chosen: one expanded block at the worst observed size (765 px) plus fourteen
single-line index rows (~40 px each, the height this page's own one-line table row measures) plus a
header and region padding (~120 px) projects to **≈ 1,465 px**.

- **FC-A1 — the win.** With this same database at 1646, the sittings list measures **≤ 2,000 px**
  (from 8,487; a ≥ 76 % reduction). The bar sits above the 1,465 px projection so that an index row
  wrapping to two lines fails it — that would be a design failure worth catching, not a rounding
  term.
- **FC-A2 — the saving reaches the page.** Document height falls by **≥ 6,000 px**, so the height
  is not given back somewhere else on the screen.
- **FC-B — the set stays visible.** Every one of the 15 sittings is named and dated **at rest,
  with no disclosure opened**. This is the whole difference between the shape chosen and the
  dropdown that was asked about, and it is the thing that would be silently lost by building the
  easier one.
- **FC-C — comparison survives.** Each index row states the **canvas size**, because
  `docs/TECH_DEBT.md` #261/#283 establish that readings are only comparable at the same canvas —
  so a reader can find the comparable sittings from the index without opening each in turn.

**If FC-A1 or FC-A2 misses, the shape is re-costed or withdrawn rather than tuned** (ADR-0142 D4: a
remedy is measured before it is built, and approval is not evidence that it works).

## 5. The shape, and why not the dropdown that was asked for

A dropdown clears FC-A1 and **fails FC-B by construction**: it hides the set, so the reader cannot
learn how many sittings exist, scan their dates, or spot two taken at the same canvas without
opening the list and holding it in their head. The comparability paragraph already on this panel
tells them to do exactly that comparison. So: the newest sitting stays expanded, and the rest
become one compact row each in a table the reader can scan, each row offering to take the detail
slot.

## 6. One constraint that decides the implementation

**`DataTable`'s public contract must not change.** A row-selection prop on the shared primitive is
an ADR-0105 trigger — a component's public contract — and crossing one mid-flight stops the work
for a spec. The index therefore carries its own per-row control inside `features/perf-probe/ui/`,
which needs nothing new from the primitive.

---

# M7 completed — the verdict

**Taken:** 2026-09-15, same instrument, same database, same width. **Every condition clears.**

| condition                                  | bar             |                         measured | verdict  |
| ------------------------------------------ | --------------- | -------------------------------: | -------- |
| **FC-A1** — the sittings list              | ≤ 2,000 px      |             **8,487 → 1,666 px** | **PASS** |
| **FC-A2** — the saving reaches the page    | ≥ 6,000 px fall |   **12,842 → 6,021 px** (−6,821) | **PASS** |
| **FC-B** — every sitting named at rest     | 15              |         **15 named, 1 expanded** | **PASS** |
| **FC-C** — the canvas is on each index row | present         | every row, pinned by a unit case | **PASS** |

The Performance panel falls **8,775 → 1,954 px**; the page falls **12.8 → 6.0 screens**; the list
is **27.7 %** of the document where it was 66.1 %. The 1,666 px is 14 % over the 1,465 px
projection, and the reason is not slack in the estimate: the newest sitting on this database happens
to be a six-reading sweep, which is the 765 px worst case the projection used for one block and the
index rows then cost slightly more than a bare table row.

## 7. The caveat this was going to need, answered by measurement instead

The before and after were taken **fifteen minutes apart rather than in one sitting**, and
`m0-measurement.md` §10 records this page's own baseline drifting **+555 px with no product change**
— staff activity grows by about seven rows every time the console is opened, including by the
harness. So a document-height comparison across two runs is exactly the shape ADR-0128 calls
INDETERMINATE.

It is not, and the evidence is arithmetic on the two runs rather than an argument:

```
rest of page = document − sittings list
  before: 12,842 − 8,487 = 4,355 px
  after:   6,021 − 1,666 = 4,355 px
```

**The non-history page is 4,355 px in both runs, to the pixel.** Nothing outside the history moved
between them, so the whole 6,821 px delta is the history and FC-A2 is a like-for-like reading. That
also re-derives FC-A1 independently: the same two numbers give the list's own change without
consulting the container at all.

The two figures are comparable in the first place because `data-probe-history-list` was put
**exactly where the `div.space-y-8` holding the blocks was** — same node, same contents including
the cap note — which the harness now states in its own output (`List located by`) rather than
leaving a reader to assume.

## 8. What it does NOT establish

- **One width, one database.** 1646 on fifteen accumulated sittings. An installation with two
  renders a much shorter page either way, and the ratio is not portable — the same caveat M6 put on
  FC-2, for the same reason.
- **The index row's height is not fixed.** A long machine label wraps, and this database has one
  (`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device …`). That is the honest worst case and it is in
  the measurement; a database of short labels would come in lower.
- **Nothing here is a claim about the readings themselves.** `docs/TECH_DEBT.md` #75's owed figures
  are unaffected: this changes how the history is displayed and not one stored number.

---

# M7 gate pass — three reviews, five blocking findings, all folded

**Taken:** 2026-09-15. accessibility, ux and component over the combined diff. **All three blocked**,
on five defects that had passed a human read and every gate above. Every fix carries a regression
test **verified red against the shipped defect first**; the four that had no test after the fix was
written are noted as such, because one of them passed a mutation sweep and would have shipped
unprotected.

**1 (accessibility). The cap caveat reached the index and never the expanded block** — and the file's
own docblock said the opposite, in as many words: "a single sitting can itself be truncated at fifty
rows, and hiding the caveat until a second sitting exists would withhold it from the one history
where the reader has nothing else to compare against." `CAP_ID` was in `SittingIndex`'s
`describedById` and absent from `SittingBlock`'s `describedBy` array, and the index does not render
at all when there is one sitting — so in exactly the state the docblock names, a reader landing
inside the readings region by landmark navigation heard nothing about the cap. A docblock describing
an intent the code did not have. **Its fix then passed the mutation sweep**, because nothing asserted
the wiring; the test written afterwards was verified red.

**2 (ux). "One reading — 2 readings", on the commonest single press there is.** The index appended a
reading count to the sitting kind unconditionally, so a single press of one reading read
"One reading — 1 reading" and one of two read an outright contradiction — and `canvas-draw` is the
panel's **default** scenario and measures two scales in one press, so that is the likely majority
shape. The expanded block never had the defect: `sittingCaption` deliberately appends a count only
for a sweep, and the index reintroduced the conflation that caption exists to avoid. `describeReadings`
now returns `null` where the count is a tautology and keeps it where it is a fact.

**3 (ux). The verdict tally painted "5 passed" in alarm ink** whenever the sitting also held a
failure — breaking the rule `sitting-index.ts` states in its own docblock and `VerdictCell` already
honours one level down ("an INDETERMINATE or an ungraded reading is not bad news, and colouring it as
though it were would be the confident wrong answer"). Each tally entry now carries its own tone.

**4 (component). The shaded button used a JS ternary where the codebase has an established idiom.**
`confirm-dialog.tsx`, `scope-save-bar.tsx` and `WbsBulkAssignBar.tsx` all spell it
`aria-disabled:pointer-events-none aria-disabled:opacity-50` — static classes reacting to the
attribute that is already conditional. The ternary also omitted `pointer-events-none`, so the shown
row's button lit its hover fill while refusing the click: the looks-live-but-refuses defect ADR-0082
exists to remove.

**5 (component). The machine and canvas fallbacks were written twice**, in `SittingFacts` and in
`sittingIndexRow`, byte-identical, with nothing able to notice if one changed — inside the file whose
own docblock cites ADR-0121 about exactly that. Extracted to `machineLabelOf`/`canvasLabelOf` in
`sitting.ts`; every existing test passed through the change unedited, which is the property that made
it safe.

## 9. Two suggestions taken, and what they cost

**The press now brings the promoted block into view** (raised independently by ux and accessibility).
The detail slot is above the index, so pressing Show on a row near the bottom changed something
off-screen: a screen-reader user heard the announcement and a sighted one saw a badge appear beside
their own cursor. `scrollIntoView({ block: 'nearest' })`, guarded exactly as `combobox.tsx:311`
guards it — **and the guard is not defensive noise**: the unguarded version threw in jsdom _before_
`announce` ran, so a cosmetic scroll swallowed the one channel a screen-reader user has. Found by the
suite going red on the announcement rather than on the scroll, which is the right way round.

**Two more confounds are on the row**: a sitting that spans more than the spread limit, or where any
reading lost the window, now carries a badge. The Canvas column exists because readings are
comparable only at equal canvas (#261/#283) — and those two are untrustworthy for the same kind of
reason, and were reachable only by opening each sitting in turn, which is the cost this index exists
to remove.

**Re-measured after the fold-ins**: the list is **1,715 px** over **16** sittings (the journey runs
added one between the readings), against 1,666 px over 15 — **+49 px for one more row, so the
fold-ins cost nothing measurable**. FC-A1's 2,000 px bar still clears with 285 px to spare. And the
non-history page reads **4,355 px for the third consecutive time, to the pixel**, which is now less
a control than a property of this fixture.

## 10. One review point taken as a correction to this document rather than to the code

The ux review observed that **FC-A1's 2,000 px bar was derived from the chosen design's own projected
cost** (≈1,465 px plus headroom) rather than against the alternative — so it proves "the index meets
its own budget", not "the index is worth what it costs against a dropdown". That is fair and the
arithmetic is owed here rather than left implicit: a dropdown would be the same expanded block
(765 px) plus a one-line select, call it **≈900 px**, against the shipped **1,715**. So FC-B and FC-C
— the set staying visible, and the canvas being scannable across sittings — are bought at roughly
**double a dropdown's footprint**, on a page that still falls from 12.8 screens to 6.1. That is the
trade, stated as a number; it was the right one to make, and it was not free.
