# M0 — the measurement, and what it corrected

- **Taken:** 2026-09-16, against `0713a24a` — **before any product commit of this epic**, which is
  M0's whole point (ADR-0099 records a sweep taken against a half-changed tree, where every number
  after the first edit was noise and none of it was a finding).
- **Fixture:** `shoot-co-1789565377153-1646` — 123 clients, 81 calendars, 80 resources, 1 member,
  2 invitations, 27 audit rows, 34 of the reader's own activity rows, 1 client with 3 projects.
- **Instrument:** `apps/web/scripts/measure-page-drift.mjs` and `measure-page-density.mjs`, both at
  1646 × 1000; drift additionally at 1280.
- **Raw output:** `m0-drift-1646.json`, `m0-drift-1280.json`, `m0-density-1646.json` in the session
  scratchpad; the tables below are derived from them and nothing here is typed from memory.

---

## 0. The instrument was wrong first, and this is what changed

M0-T1 exists because the harness measured **a page list that was neither the scope nor a subset of
it**: it included `account` — a _declared exception_ to the page frame — and omitted `client-detail`
and `project-detail`, which are in scope and carry four of the ten hand-rolled `<h1>` sites. So every
statement of the form "three rhythms across eight screens" taken from the first run was **about the
wrong eight**.

Three further things were added, each because a number was conditional on something the output did
not name:

| Added                        | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The state block**          | The Project Explorer is a resizable drawer, so every `x` below is a function of a width the reader chose. ADR-0113's finding one instrument along. It is derived as `main`'s **left offset**, not by finding the Explorer's box: the shell is `grid-cols-[auto_minmax(0,1fr)]` with the Explorer alone in column 1 (`app-shell.tsx:134`, `:174`, `:203`), so the offset **is** the column's width — and it stays right when the Explorer is folded, hidden below `lg`, or **absent entirely** on a route with no organisation (ADR-0104), where a selector finds nothing and would report a misleading `0`. |
| **The run header**           | git SHA, width, slug, timestamp, and the resolved detail ids. A measurement that cannot say which tree it was taken against cannot be compared with its successor.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Per-column natural width** | M0-T2. A column rendered at 300 px whose content wants 90 px is slack; one rendered at 300 px whose content wants 290 px is the table. Without it, "the row spread is 1,030 px" is a number with no diagnosis attached — and §4.3's remedy has to be chosen against a cause.                                                                                                                                                                                                                                                                                                                                |

**`account` is kept and labelled**, not dropped. A measurement of what is deliberately different is
worth having, and dropping it would make the exception invisible to the instrument that exists to
see differences.

---

## 1. Five corrections to figures already reported

Recorded in place rather than silently updated, per M0-T1 step 5 — a measurement that disagrees with
its predecessor is a finding.

### C1 — there are **four** header rhythms, not three, and the spread is 30 px not 10

The plan predicted this (M0-T1 step 4) and it landed. The two breadcrumbed detail screens are the
fourth value **and the largest**:

| `h1.top` | Screens                           |
| -------- | --------------------------------- |
| **75**   | members, audit-log, my-activity   |
| **83**   | recently-deleted                  |
| **85**   | clients, calendars, resources     |
| **105**  | **client-detail, project-detail** |

**Identical at 1280 and 1646** — so this is a vertical-rhythm difference, not a responsive artefact,
and no width will resolve it. `font-size` (24 px) and `font-weight` (600) agree on every screen;
only the position differs.

### C2 — three description measures in scope, not four; and a fourth state that is not a measure

The previously reported four (267 / 624 / 672 / 1104) included **624, which is `account`** — the
declared exception, out of scope. In scope it is three:

| Width       | Screens                                      |
| ----------- | -------------------------------------------- |
| **267 px**  | members                                      |
| **672 px**  | recently-deleted                             |
| **1104 px** | calendars, resources, audit-log, my-activity |
| **(none)**  | **clients, client-detail, project-detail**   |

The last row is the finding the earlier run could not produce: three in-scope screens carry **no
page-level description at all**, so "one measure" is not the whole rule — M3 has to decide what a
screen with nothing to say renders, and the answer cannot be an empty paragraph.

### C3 — row height is **not** a uniform 49 px, and I said it was

This is the sharpest correction because **the data I already had said otherwise**. The density run
reported `{'53': 1}` for members and `{'57': 24, '69': 3}` for audit-log in the same output I
summarised as "a uniform 49 px". ADR-0076 Class 3: a decision-bearing claim asserted without
checking, from a file open in front of me.

| Table                                                               | Row height(s)                      |
| ------------------------------------------------------------------- | ---------------------------------- |
| clients, calendars, resources, client-detail, project-detail (both) | **49**                             |
| members — roster                                                    | **53**                             |
| members — invitations                                               | 49                                 |
| audit-log, my-activity                                              | **57**, and **69** on 3 of 27 rows |

It changes the work. **Audit-log's density cost is chrome AND row height**; the two volume lists'
is chrome alone. A remedy aimed only at chrome leaves audit-log's rows 16 % taller than clients'
with nothing saying why — and the two heights _inside one audit table_ are a wrapping artefact of
the `Subject` column, not a decision anybody made.

### C4 — the row spread has **more than one** cause, and the widest table is the least guilty

M0-T2's attribution, and it inverts the ranking. Slack is `rendered − natural` summed over a
table's columns:

| Table                      | Spread  | Columns | Slack   | Verdict                                                             |
| -------------------------- | ------- | ------- | ------- | ------------------------------------------------------------------- |
| my-activity                | 1030 px | 5       | **205** | **not a defect** — this is what a 5-column audit table looks like   |
| audit-log                  | 1029 px | 5       | **205** | **not a defect** — same table, same content                         |
| members — invitations      | 954 px  | 5       | 369     | mixed                                                               |
| clients                    | 951 px  | 3       | 215     | mostly real: `Description` wants 519 px of its 661                  |
| calendars                  | 937 px  | 5       | 415     | slack                                                               |
| members — roster           | 923 px  | 4       | **491** | slack — `Email` renders 521 px for 286 px of address                |
| project-detail — projects  | 775 px  | 4       | **530** | slack                                                               |
| project-detail — calendars | 707 px  | 4       | 274     | mixed                                                               |
| client-detail              | 710 px  | 3       | **518** | slack — one row, so `Name` renders 425 px for a 118 px project name |
| resources                  | 704 px  | 6       | 331     | mixed                                                               |

**ADR-0098's diagnosis does not transfer**, which is exactly what M0-T2 step 3 asked to be checked
rather than assumed. The two widest-spread tables in the estate are the two with the least slack in
it; the worst offenders are the **short** tables, where a column's natural width is one row's
content and the table stretches it to fill the measure.

### C5 — `my-activity` renders with no Explorer at all, so "one rhythm" cannot mean "one offset"

`explorerWidth` is **277 px** on all eight organisation-scoped screens and **0** on `my-activity`
(and on `account`). That is correct and deliberate — ADR-0104 withholds a control whose subject is
an organisation from the three routes that have none — but it means `my-activity`'s content column
is 1646 px wide where its neighbours' are 1369, and its frame's left edge is 277 px further left.

So a uniformity claim has to be stated in terms a reader can check: **the same rhythm within the
frame**, never the same absolute `x`. Nothing in the epic should try to align those two screens to
their neighbours, and a gate that asserted an absolute offset would be permanently red on one of
them for a reason that is not drift.

---

## 2. What held

- **Chrome before the first row is the density cost**, and the figures are unchanged:
  clients 180 px (18 % of a 1000 px viewport, 16 rows in the first screen),
  resources 276 (28 %, 14), calendars 304 (30 %, 14), members 269 (27 %),
  **audit-log 414 (41 %, 9 rows)**. Taking audit-log to clients' 180 px is ≈ +44 % rows per screen
  with no change to a row.
- **`PageHeader` is used by 1 of 9 in-scope screens; `SectionCard` by 1** — `members` is the only
  consumer of either, and the only screen with any `<section>` at all (`Roster`,
  `Pending invitations`). Eight in-scope screens report `sectionCount: 0`.
- **Row actions are five different shapes** across six tables:
  clients `Edit · Delete`; calendars `Edit · ⋯`; resources `Edit · Archive · Delete`;
  project-detail's projects `Edit · Delete`; its calendars `Move to this project · Edit`;
  members `Remove`. Calendars is ADR-0097 Landing F1's exemplar and the only one behind a menu.
- **The page frame does not drift** — `frameMaxWidth` is `1152px` on all nine, and `672px` on the
  declared exception. It shipped as a gate the day before this epic opened; nobody should plan
  frame work.
