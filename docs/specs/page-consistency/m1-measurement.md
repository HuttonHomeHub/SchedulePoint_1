# M1 — the header: what it moved, and the two defects it exposed

- **Taken:** 2026-09-16, at 1646 × 1000 and 1280 × 1000, against the same fixture M0 used.
- **Before:** `m0-drift-1646.json` / `m0-drift-1280.json`. **After:** `m1-final-1646.json` /
  `m1-final-1280.json`.

---

## 1. FC-1 clause 1 — the header rhythm: four values → two

| `h1.top` | Before                                 | After                                      |
| -------- | -------------------------------------- | ------------------------------------------ |
| 75       | members, audit-log, my-activity        | **seven screens**                          |
| 83       | recently-deleted                       | —                                          |
| 85       | clients, calendars, resources          | —                                          |
| 103/105  | client-detail, project-detail (at 105) | **client-detail, project-detail (at 103)** |

**Identical at 1280 and 1646**, before and after.

**Verdict: PASS against FC-1 as amended.** The residual 28 px is the `Breadcrumbs` trail's own
height, the two breadcrumbed screens agree to the pixel, and forcing them level would mean deleting
the trail or overlapping it. FC-1 clause 1 is amended **in place, with the reason**, rather than
declared a pass against a condition that meant something else — M1-T3 anticipated this specific
outcome in writing **before** the run, which is what makes the amendment an amendment rather than a
negotiation.

The 105 → 103 is the archetype's own rhythm replacing a hand-rolled one, not a change anybody aimed
at.

---

## 2. FC-4 — the weight ratchet: 168 → 157

**Eleven weight sites out, against a bar of ten and a derivation of thirteen. PASS.**

All eleven are the conversion rather than a cut: eight screens hand-rolled
`<h1 className="text-2xl font-semibold tracking-tight">`, `account.tsx` a ninth, and
`client-detail` and `project-detail` carried **two each** — the subject's name and the not-found
branch. The weights are still placed; they are no longer placed by a screen, which is the
distinction the ratchet exists to measure.

Measured by forcing the ceiling to 0 and reading the failure, before and after, so the figure is
the live count and not the constant. `ARBITRARY_SIZING_CEILING` is unmoved at **17**, satisfying
FC-4's second clause — which, with zero headroom, means this milestone introduced no arbitrary
sizing value at all.

The ceiling is lowered to **157** in the same commit that earns it. The remaining two of the
derived thirteen are M2's.

---

## 3. FC-1 clause 2 — and the two defects that had to be found in order to judge it

The clause is _"the page-description measure takes exactly one distinct value among the screens that
render one"_. Judging it took two corrections, **and the instrument's came first** — which is the
order that matters, because the product defect was invisible while the instrument was wrong.

### 3a. The instrument could not identify a page description

`measure-page-drift.mjs` reported "descriptions" as **every paragraph before the first table**. That
was the only thing available before `PageHeader` existed, and it conflates three different things:
the page's own description, a `SectionCard`'s, and a filter bar's prose. So its first M1 run
reported calendars and resources at **1104 px** — neither of which has a page description at all;
that was the filter bar — and recently-deleted "diverging" from 672 px to 888 px.

`PageHeader` wires its description with `aria-describedby` from the `<h1>`, so the link **is** the
locator. The probe now follows it: there is no guessing, and a screen that stops using the archetype
reports `null` rather than silently reporting its next paragraph instead. Ninth instance in this
repository's register of an instrument measuring the wrong subject.

### 3b. `PageHeader` had no measure — the description's width was its own text's width

With the probe fixed, the real figures were **267 px on members, 546 on audit-log, 736 on
my-activity**: the archetype's title/description column was `min-w-0` alone, so it is an
`auto`-width flex item that **shrink-wraps to its content**. A 42-character description rendered
267 px wide and a 116-character one 736 px, on screens sitting side by side in the same product.

That is not a measure. It is the text's own width wearing one — and it is the exact failure FC-1's
withdrawal bar is written for: _one value cannot be reached without a per-screen override, so the
archetype is wrong._ It was wrong, so **the archetype was fixed rather than the screens overridden**:
`flex-1` gives the column the frame's width and `max-w-prose` caps the line length inside it — the
same pairing `EmptyState` has used one file over since the archetypes shipped.

**After: every page description is 546 px, at 1280 and at 1646, on all four screens that render
one.** One measure, structurally — not four screens that happen to agree today. All 387 tests
across the three surfaces that consume `PageHeader` (overview, staff, the nine screens) pass
**unchanged** through the archetype change, which is the contract it preserves.

### 3c. Clause 3 — the six screens that render no page description

Recorded here as state; **the per-screen decision is M3's**, which is the milestone that owns the
prose:

| Screen                        | Today                                                                     |
| ----------------------------- | ------------------------------------------------------------------------- |
| clients                       | none, and never had one                                                   |
| client-detail, project-detail | none unless the subject itself has a `description`, which it then shows   |
| calendars, resources          | none — the 1104 px paragraphs the old probe reported are the filter bar's |
| members                       | none — its prose is `SectionCard`'s, one level down                       |

---

## 4. One deviation from the plan, and its reason

**M1-T1 specified five gate assertions and the gate ships with four.** The `<h2>` assertion —
"`SectionCard` owns the section rank" — is M2's work, and M1 ships alone by the product owner's
decision. Landing it now would mean either pulling M2's conversion into M1 or putting a knowingly
red gate on `main`, and the plan's own M1-T1 step 4 says why the second is worse: **a gate that is
red on purpose is a gate people learn to ignore.**

It is not deferred blind. The assertion was **run red first** and named exactly three files —
`routes/client-detail.tsx`, `routes/project-detail.tsx`,
`features/calendars/components/ProjectCalendarsSection.tsx` — so M2 inherits a known-discriminating
assertion rather than writing a fresh one against its own finished work.

### The gate's red run, recorded

Against the pre-conversion tree, the `<h1>` assertion named **eight** files and `members.tsx` was
**absent** from the list. That absence is the cheapest available proof the scan discriminates rather
than matching everything: `members.tsx` was converted when the archetypes shipped, and it is the one
in-scope screen the gate should not name.

```
hand-rolls no a page title's type treatment (PageHeader owns it)
+   "routes/clients.tsx",      +   "routes/client-detail.tsx",
+   "routes/project-detail.tsx", +   "routes/calendars.tsx",
+   "routes/resources.tsx",    +   "routes/audit-log.tsx",
+   "routes/recently-deleted.tsx", +   "routes/my-activity.tsx",

hand-rolls no a section heading rank (SectionCard owns it)
+   "routes/client-detail.tsx", +   "routes/project-detail.tsx",
+   "features/calendars/components/ProjectCalendarsSection.tsx",
```
