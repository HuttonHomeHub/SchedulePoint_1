# The screens — composition, hierarchy, and what each one is for

> The mandate is now unrestricted: _"I want this app to be best in class in terms of ui/ux. you have
> free rein in all aspects."_ So this document designs the product, not the vocabulary. Each screen
> says what it is now (evidenced), what it should be, **why**, what is checkable, and what is taste
> with a named decider.
>
> **Three things are not taste and are treated as inputs**: WCAG 2.2 AA; the canvas's colours carry
> meaning; it stays gated.

---

## 0. The one structural idea behind all six

**The product has three navigation layers and needs two.**

| Layer                            | Carries                                                  | Measured cost                       |
| -------------------------------- | -------------------------------------------------------- | ----------------------------------- |
| App header                       | brand mark, **organisation nav (7 links)**, account chip | 56 px tall, **637 px** of nav width |
| Project Explorer rail            | Client → Project → Plan tree, lazy + virtualized         | 28 px rows                          |
| Plan identity + two toolbar rows | plan name, path, pen, modes, view switch, 32 commands    | 45 + 45 + 44 = **134 px**           |

_(widths and heights from `workspace-chrome/m0-band-measurement.md` §2–§3, measured at 1646)_

The organisation nav and the Project Explorer are **the same layer wearing two shapes**: one is
"where in this organisation", the other is "where in this hierarchy". Splitting them across a
horizontal strip and a vertical rail costs 637 px of the scarcest width in the product and gives a
planner two places to look for "where am I".

**So: the rail becomes the only navigator, and the header stops being one.** That single move frees
637 px, and it is what makes everything else in this document affordable — including the ambition in
§1.2 that three previous epics measured as out of reach.

---

## 1. The plan workspace

The surface this product exists to be, and the one the product owner has reported on three times.

### 1.1 What it is now

At 1646 px: **249 px of chrome above 558 px of canvas — 31 %** — before any transient strip. Four
horizontal bands stack above the diagram (app header 56, plan identity 45, `View and navigate` 45,
`Build and manage` 44), a rail to the left, and the ADR-0092 dock at the foot of the canvas.

### 1.2 What it should be: **one band above the diagram**

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ▣ SchedulePoint   Riverside · Logic [Draft]   Plan▾ Edit▾ View▾ Insert▾ Analyse▾       │
│                   ⌕ ⤺ ⤻ ⊕ ⇄ ⌖ ⊞ ⟳    Early|Visual  Diagram|Gantt   Stop editing    (JE)│
├──────────┬─────────────────────────────────────────────────────────────────────────────┤
│ RAIL     │  ← the diagram starts here                                                  │
│  org ▾   │                                                                             │
│  ─────   │                                                                             │
│  ▸ tree  │                                                                             │
│  ─────   │                                                                             │
│  Library │                                                                             │
│  Members │                                                                             │
├──────────┴─────────────────────────────────────────────────────────────────────────────┤
│ Activities ▴   [ the dock — transient strips portal here, at zero cost ]               │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

Three bands become **one**, because:

- the **command surface collapses from 32 stops to 5 menus + 8 commands**
  (`command-surface.md` — the registry's own seven-group taxonomy read as menus rather than as
  layout);
- the **plan identity sheds 456 px** of measured redundancy (the breadcrumb path the rail already
  shows, 199 px; the pen badge and live-region sentence that restate the button beside them, 257 px
  — `workspace-chrome/m0-band-measurement.md` §4);
- the **organisation nav leaves the header** for the rail (§0), freeing 637 px.

**The arithmetic, and it is a prediction that M0 must falsify.** Header content after the nav leaves:
brand 160 + account 52 = **212**. Command band, from `command-surface.md` §3.1: **~1465**. Together
**~1677 against a 1646 viewport** — **31 px short.** Two measured cuts are available and either
closes it: the brand wordmark → mark only (**−120 px**, measured, `m0-band-measurement.md` §4a), or
the strip drops from eight commands to six (**−72 px**).

**If it fits: 190 px of chrome becomes 56, and the canvas goes 558 → ~692 at 1646 — a 24 % larger
diagram.** That is larger than the whole of ADR-0090, ADR-0091 and ADR-0092 delivered between them,
and it is available now only because the nav move frees width those epics did not have.

**If it does not fit, the fallback is two bands** (header 56 + command band 44 = 100 px), which still
returns 90 px and does not depend on the nav move at all. The fallback is named up front because
ADR-0092 M5 measured a merge, found it 134 px short, and **withdrew it** — that is the precedent, and
it is why this is written as a gate rather than a plan.

### 1.3 The diagram itself

Not "prettier". Four changes, each of which makes the schedule more legible:

1. **A working ground, not a page.** A quiet warm surface distinct from the chrome and the rail
   (CQ-A). A drawing board reads as a place to work; white reads as a document.
2. **Criticality separated by lightness, not only by hue.** Ordinary vs critical is **1.27:1** apart
   in luminance today (`diagnosis.md` §3.3) — the two states a planner scans a wall of bars for. The
   plot separation matrix (`design.md` §8.2) makes that a number the build reports.
3. **Depth by ground, not by shadow.** The month bands, the non-working hatch and the gridline tiers
   already form a three-layer ground; they should read as one system rather than three features
   (they arrived in ADR-0055 §4, ADR-0056 and ADR-0054 respectively).
4. **The bar is the unit.** 18 px in a 28 px lane today. With `--lane-h`/`--lane-bar-h` as tokens the
   ratio becomes a decision rather than two constants in `geometry.ts:35,37`.

### 1.4 The dock stays, and gets more work

ADR-0092's dock is the best structural idea in the recent register: transient strips portal into the
Activities handle row at **zero canvas cost** (measured as an equality). It stays, and §3 gives it
the activity editor.

---

## 2. The activity editor — a panel, not a dialog

**The largest behavioural proposal in this document, and the one that most needs `ux-reviewer`.**

### What it is now

A four-tab `xl` (896 px) modal dialog with a vertical tab rail (ADR-0061), per-scope save
(ADR-0060), and Logic / Resources / Notes as tabs (ADR-0062). Four epics of genuinely good work.

### The problem the four epics could not address, because the container was fixed

**A planner edits an activity in order to change the schedule, and a modal hides the schedule.**
Change a duration, and the thing you wanted to see — what moved — is behind the dialog. Every
`ContextStrip` in ADR-0061 exists to carry facts into a dialog that covers the surface those facts
came from.

### What it should be

**The workspace's right panel**, resizable via ADR-0030's existing orientation-aware `PanelResizer`,
holding the same four scopes, with the diagram live beside it. Recalculation re-flows the bars while
the editor is open, which is this product's core promise (`PROJECT_BRIEF.md` §2 — _"dragging an
activity through time should re-flow the network live"_).

Everything ADR-0060/0061/0062/0089 decided **survives verbatim**: per-scope save, the gate objects,
the tab set, the field vocabulary, the `ScopeSaveBar`. Only the container changes — which is
precisely the ADR-0062 extraction argument, run once more: the panels are the same components.

**What it costs, honestly:** the panel takes width from the diagram while open, where the dialog took
all of it; a modal's focus trap goes away and focus management becomes a panel's (harder, and
`accessibility-reviewer` should specify it during design, not review it after); and on a narrow
viewport the panel must still become a sheet, so both paths exist.

**Decider: the product owner, on a `ux-reviewer` recommendation.** This is a workflow change, not a
styling one.

### What follows

`Dialog`'s **`xl` size preset retires with it.** ADR-0061 says `xl` is _"for the two-pane rail layout
only — widening a single-column form to 896px produces 900px-long input rows"_. Remove its only
consumer and the preset is a loaded gun. Dialogs return to `md` (a record) and `lg` (a dense record
or a list).

---

## 3. The Project Explorer — the product's only navigator

### What it should be

A single rail with three zones and one job:

| zone       | holds                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| **top**    | the organisation switcher, and a search that filters the tree                                            |
| **middle** | the Client → Project → Plan tree — flexible height, the rail's purpose                                   |
| **bottom** | the organisation's destinations: Calendars, Resources, Members, Audit log, Recently deleted, My activity |

The bottom zone is the **637 px of header nav**, relocated. It belongs here because those are places
in the organisation, and the rail is where "where am I in this organisation" is answered.

Three consequences:

- The app header stops carrying navigation and becomes identity + account.
- The tree gets the vertical space the header row was spending horizontally.
- **`aria-current="page"` finally has one home.** Today the header marks the current page with grey
  and weight (`app-header.tsx:15-16`) and the tree marks selection separately; one navigator means
  one current-state treatment, which is the accent's first named role (`design.md` §2.2).

**The tree itself is not redesigned.** ADR-0029's lazy, virtualized ARIA `tree` is correct, and
28 px rows become `--row-h`, shared with the Gantt and the tables (CQ-B).

---

## 4. The Gantt

Read-primary, now editable (ADR-0095). Composition changes, not a rebuild:

1. **The chart region takes `tone="canvas"`** — one drawing ground across both views of the plan
   (`design.md` §1.2). A bar means the same thing and is the same colour in both.
2. **One ruler.** `--ruler-h` replaces 34 px here and 40 px on the TSLD.
3. **`--row-h` at 28** (CQ-B), so the Gantt, the tree and the tables scan at one rhythm. §"What one
   rhythm costs the Gantt" in `hard-surfaces.md` is where the trade is argued.
4. **The grid is a data surface**: `text-data` (tabular figures by construction), numeric columns
   right-aligned as a **property of the column**, WBS summary rows reading as structure rather than
   as rows.
5. **Dependency arrows stay default-off**, as ADR-0095 shipped them. Not a design question.

---

## 5. Tables and lists

`DataTable` is a fifth of what `docs/DESIGN_SYSTEM.md:419-423` describes (`diagnosis.md` §2.1). It
gets a sticky header, `Skeleton` rows, `--row-h`, and a `numeric` column flag so alignment and figure
style are **properties of the data** rather than a `cellClassName` that drifts one column at a time —
which is exactly how 29 hand-applied `tabular-nums` across 18 files happened.

Sorting and selection stay with consumers (`headerCell`), deliberately: the WBS bulk-assign bar's
selection model is not the audit log's, and a table primitive that knows about permissions is a
framework.

**`ListRow` is a separate archetype.** A list of links with supporting metadata is not tabular data,
and forcing it into `<table>` misrepresents it to assistive technology and to the eye.

---

## 6. The organisation landing page (ADR-0098)

**Recommended as the first fully-realised screen in the new language** — see `migration.md` for the
sequencing argument and the recommendation to the product owner.

Composition: a page header that names the organisation and the reader's place in it; a metrics strip
(counts that are facts, in `text-data`, not decorative KPI cards); **"Jump back in"** as `ListRow`s;
**"Needs attention"** as `NoticeStrip info` — which its own spec correctly established already exists
and must not reach for `destructive`, because holding an editing lock is a prompt, not a failure; and
**"Recently changed"** as a feed of `ListRow`s.

Three empty states, all `EmptyState`, all on the first screen a new customer sees. That is the
argument for building the primitive rather than a fourth bespoke one (`docs/TECH_DEBT.md` #21(d)).

---

## 7. The public screens

With **one theme** (see `design.md` §0), ADR-0077 §2's argument dissolves: `brand` and `auth` were
pinned dark navy in every theme **because a signed-out visitor never chose one**, and there is now
nothing to be invariant against.

- **`brand` survives** — on the ordinary ADR-0055 argument, not the invariance one. The panel is navy
  and the page is off-white; that is a region whose fill is chosen for a reason the page's cannot
  serve.
- ~~**`auth` retires.**~~ **Measured 2026-08-18: it stays.** The premise below is correct as
  history and wrong as a conclusion — losing its original reason is not the same as having none.
  12 of its 18 tokens differ perceptibly from the page, including a WCAG-derived focus ring.
  It exists only because §2's argument was applied to half the screen
  (ADR-0077 §8.3). With one theme the card simply is a card on the page, and an entire 18-token
  family goes with it. Verify before deleting: the four `--auth-*` values that differ from the page's
  by design (the tinted field, the derived amber ring) either become page values or become the
  reason `auth` stays. **That check is a task, not an assumption.**

The login's composition — the 900 px fixed-height card on a gradient ground, the photograph, the
amber seam — is the best-designed screen in the product and is **not** reopened.

---

## 8. The staff console

`page` surface, `default` density, `PageContainer` + `PageHeader`, six `SectionCard`s. Its written
workaround at `staff.tsx:117-118` — _"`CardTitle` is deliberately not used: it renders an `h1` and
this page already has one"_ — is deleted when `CardTitle` gains `level`.

---

## 9. Where the collaborators come in, and what to ask them

**I cannot launch agents** — this session's tools are read and write only. So rather than pretending,
here is the brief for each, at the point it is cheapest.

| Agent                      | When                                     | The question to put                                                                                                                                                                                                                        |
| -------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **accessibility-reviewer** | **Before** any value is chosen (M0)      | The menubar's keyboard model; the activity-editor panel's focus management with no modal trap; and the plot separation floor — is 1.5:1 the right house number, and what does low vision need from a criticality encoding that is not hue? |
| **ux-reviewer**            | **Before** the panel decision is taken   | Activity editor: dialog vs docked panel. And the eight-command strip: which eight, given there is no telemetry?                                                                                                                            |
| **component-reviewer**     | On the archetype set, before it is built | `PageContainer` / `PageHeader` / `SectionCard` / `EmptyState` / `Skeleton` / `ListRow` — API shape, and whether `menubar` belongs in `ui/` beside `Menu`                                                                                   |
| **performance-reviewer**   | On the single-theme collapse             | Bundle delta from deleting `.dark`; and the self-hosted typeface's LCP cost on the coldest screen                                                                                                                                          |
| **accessibility-reviewer** | Again, on the built menubar              | The APG `menubar` conformance pass                                                                                                                                                                                                         |

The register is full of findings that would have been cheap in design and were expensive at review —
ADR-0064 §7, ADR-0067 M4, ADR-0086 M6, ADR-0089 M6. This table exists so that does not happen again
in the largest UI epic the project has attempted.
