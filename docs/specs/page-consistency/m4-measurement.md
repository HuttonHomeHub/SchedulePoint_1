# M4 — the row and the filter: two instrument findings, and a rule I got wrong first

- **Taken:** 2026-09-16, 1646 × 1000 and 1280 × 1000, same fixture.
- Before: `m0-drift-*.json`. After the row-action change: `m4b-1646.json`. After the width caps:
  `m4d-1646.json` / `m4d-1280.json`.

---

## 1. The finding that mattered: "row spread" was measuring the actions column

M0-T2 attributed each table's **spread** — `lastCellX − firstCellX`, the distance from the first
cell's left edge to the last cell's — and used it to decide which tables had a defect. After M4
replaced three text buttons with one `⋯`, that number **grew** on five tables, by up to **+196 px**,
while nothing a reader looks at moved at all.

The arithmetic says why, exactly rather than approximately: on every table here,

```
lastCellX − firstCellX  ==  tableWidth − lastColumnWidth
```

and the last column is `Actions`. So the metric was reporting **where the actions column starts**.
Narrowing `Actions` moves its left edge right, which grows the number — and narrowing `Actions` is
precisely what M4 set out to do.

Two consequences, and the second is the sharper one:

1. **M0-T2's attribution was measuring the wrong quantity.** Its verdicts still hold, because it
   compared the number against each table's own column **slack**, which is independent — but the
   number it was attributing was never "how far a reader's eye travels between a row's first fact
   and its last".
2. **M4-T2's remedy is arithmetically incapable of moving it.** `tableWidth` is pinned by FC-3 and
   `lastColumnWidth` is the actions column, so no width preference on any leading column can change
   `lastCellX − firstCellX` at all. Had this not been caught, the milestone would have added width
   caps, re-measured, found the number unmoved or worse, and concluded the remedy does not work.

`measure-page-drift.mjs` now reports **`factSpread`** — the distance to the last **content** cell —
beside the old number, because the M0 baseline holds the old one and a comparison needs it. The two
disagree by 300–700 px on every table with an actions column.

**Ninth recorded instance in this repository of an instrument measuring the wrong subject**, and the
second in this epic (M1's page-description probe was the other). Both were found by an arithmetic
identity holding too exactly to be a coincidence, not by anything failing.

---

## 2. The rule for a width cap is narrower than "cap the bounded columns"

Measured on facts, the first pass of M4-T2 made **two tables better and two worse**:

| Table                      | before caps | first pass | corrected |
| -------------------------- | ----------- | ---------- | --------- |
| project-detail — plans     | 559         | **635** ✗  | **525**   |
| project-detail — calendars | 675         | 652        | **553**   |
| calendars                  | 747         | **752** ✗  | **682**   |
| resources                  | 714         | 649        | **649**   |

`factSpread` is the summed width of every column **before the last fact column**. So:

> **Cap what sits before the last fact. Leave the last fact column alone.**

Capping the last fact column cannot shrink the distance — it is not inside the sum — and its surplus
still has to land somewhere. On the plans table it landed in `Name`, the **first** column, and the
distance grew by 76 px. The rule is recorded at the call site in `ResourcesTable.tsx` rather than
here, because that is where the next person adding a cap will be.

Final, against M0: **−34, −122, −65, −65** on the four tables with bounded columns; clients,
client-detail, both members tables and both audit tables unchanged. `w-full` on the trailing column
was **not** re-proposed — ADR-0143 M5 withdrew it on measurement and M4-T2 says so.

### The cap goes on the cell, and #335 is why

The caps first went on `headClassName`, and the **ADR-0097 weight ratchet caught it**: 157 → 159.
`DataTable`'s `headClassName` **replaces** its default rather than merging it (`docs/TECH_DEBT.md`
#335, filed while writing these caps), so adding a width to a header means restating
`py-2 pr-4 font-medium` beside it — which moves a `font-medium` out of the primitive and into a
screen, which is precisely what that ratchet counts.

**The fix for #335 was considered and declined here**, on measurement rather than on principle:
`cn(DEFAULT, column.headClassName)` would merge, but **seven `cellClassName` sites in the estate
deliberately omit `py-2`** and would silently regain it — seven table columns changing padding, in a
milestone about consistency, with no measurement behind it. That is #335's own stated reason for
being a row rather than a fix.

So the width moved to `cellClassName`, whose default (`py-2 pr-4`) carries **no weight**, so
restating it costs nothing. A width on a `<td>` constrains its column under `table-layout: auto`
exactly as one on the `<th>` does — **re-measured to confirm rather than assumed, and the figures
are identical to the pixel**: −34, −122, −65, −65 at 1646, same at 1280, ratchet back to 157.

It is a small thing that says something about #335's shape: the replace semantics do not just risk a
lost class, they **push weight out of the primitives every time a caller adds one utility** — and
nothing but an unrelated ratchet would have reported it.

---

## 3. FC-3

Every table is within the border allowance the product owner accepted at M2 — 2 px of `SectionCard`
border, reading as **1–3 px** once it lands either side of a sub-pixel column boundary. No table
lost width to a width cap. The amendment in `falsification.md` said "bounded at 2 px" and has been
**corrected to the range that was measured and accepted**, because compressing it would have left
the next reader arguing about a third pixel that was in the original measurement all along.

---

## 4. A pre-existing defect the copying exposed

`Clear filters` moved into the calendars and resources filter bars, copied from `AuditFilterBar`
rather than re-derived — including the part that matters most: **it is always rendered and shaded
when there is nothing to clear**, never conditionally mounted. A control that removes itself by
succeeding drops focus to `<body>` at the moment it is pressed, which this register records four
separate times, and M4-T3's own risk note proposed returning focus to the search field to work
around it. The precedent does not have the problem, so neither do the copies.

**What the copying did expose is that the precedent has a different defect.** `AuditFilterBar` and
`AuditEventList`'s empty state both render a button whose accessible name is the bare string
`Clear filters`, and on a filtered-to-nothing log **both are visible at once** — indistinguishable
to a reader who hears them rather than sees where they sit. It has been there since that filter bar
shipped. Reproducing it on two more screens is what made it worth fixing rather than copying: all
three empty-state controls now name their context (`Clear filters and show all calendars`), with the
visible text unchanged, so WCAG 2.5.3 Label in Name still holds.

It also broke a test as a strict-locator ambiguity, which is how it was found — the accessibility
defect and the test failure are the same fact.

---

## 5. What was extracted, and what deliberately was not

Written out side by side first (M4-T1 step 1), the five menus share **no items at all**: calendars
offers a tier move, resources an archive, clients and projects and plans only a delete. So the
extraction is the **trigger and the menu**, never the items — `RowActionsMenu` owns the ghost icon
button, `aria-haspopup`, `aria-expanded`, the anchor arithmetic, the subject-bearing name, and a
`Menu` labelled with the **same string** so the phrase a reader hears opening the menu is the phrase
they hear landing inside it.

That is five copies of a keyboard and naming contract, which is exactly what ADR-0065 and ADR-0121
record drifting invisibly. The items stay at the call site because they are not shared, and
pretending otherwise would mean a props object growing one boolean per table.

`openRowActions` / `clickRowAction` exist for the same reason one tier down: a test restating
`Actions for ${subject}` is a second copy of the contract. `clickRowAction` **awaits the row**,
because the call sites it replaced read `await screen.findByRole('button', { name: 'Archive Crew
A' })` and the `find` was doing two jobs — locating the control and waiting for the query to settle.
Converting them mechanically dropped the second, and two tests failed looking for a trigger on a row
that had not rendered yet, which reads exactly like the feature being broken.

**The cost of the shape is stated rather than glossed:** deleting a client is two presses instead of
one. The product owner accepted it on the grounds that the buried action is the destructive one and
a moment's friction is cheapest there.

---

## 6. The journey found a collision the unit tests could not

`Actions for Northgate` resolved to **two elements** on `/clients`. The Project Explorer is docked on
every organisation-scoped route and names its own node menus `Actions for <name>`
(`features/navigator/components/HierarchyTree.tsx:602`) — so the moment the clients table grew a
`⋯`, a reader had two controls with the identical accessible name, offering different actions,
indistinguishable to anyone hearing them rather than seeing where they sit. The same holds for
projects on a client and plans on a project: **three of the five converted tables.**

It is the **same class** as the `Clear filters` collision this milestone fixed an hour earlier, and
it is worth noting that this one was **created by M4** rather than exposed by it.

**No unit suite could have found it.** Each table's tests mount that table alone; the Explorer is
shell chrome that exists only in a full render. It took a journey against the real product — which
is why the plan put one on this milestone.

**Fixed by the same rule: the new control names its context.** `RowActionsMenu` takes an optional
`context`, and the three hierarchy tables pass their list name (`Actions for Northgate in Clients`).
Calendars and resources pass nothing, because they are not in the Explorer and a qualifier there
would be symmetry rather than information — ADR-0082's discriminator applied to a name.

The name is built by one exported `rowActionsLabel`, which the test helper now calls rather than
restating the format. That is not hypothetical tidiness: **the format changed once inside this
milestone**, and every place that had spelled it out by hand would have needed finding.

### Two reporting corrections

- I twice recorded `web:members EXIT=1` as a journey failure. **There is no `members` suite** — the
  output was `e2e-local.sh` listing its valid targets, and the exit code was for an unknown one.
  Members is covered by the base journey.
- The sweep's fifth failure, `staff`, **was a flake and is not this epic's.** No file in that
  suite's path is in the epic's diff, and it passed on a re-run of the same commit. The mechanism is
  visible in `probe-sittings.tsx:145`: the comparability caveat renders only once a second sitting
  exists, and the suite creates its own sittings, so a timing-dependent read can see one.
