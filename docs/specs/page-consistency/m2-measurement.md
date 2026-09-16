# M2 — the section: FC-3 caught a real 48 px, and then caught the card itself

- **Taken:** 2026-09-16, 1646 × 1000 and 1280 × 1000, same fixture. Before: `m0-drift-*.json`.
  After: `m2b-1646.json` / `m2b-1280.json`.

---

## 1. What FC-3 caught, and why the condition earned its place immediately

Three sections adopted `SectionCard`: **Projects** on a client, **Plans** and **Calendars** on a
project. The first run of the condition **failed**, and the largest failure was a real defect:

| Table                      | Before | First run | Cause                                        |
| -------------------------- | ------ | --------- | -------------------------------------------- |
| project-detail — calendars | 1104   | **1055**  | `CardContent`'s `p-6` — **48 px of padding** |
| client-detail — projects   | 1104   | 1102      | the card's 1 px border, each side            |
| project-detail — plans     | 1104   | 1102      | the same                                     |

The 48 px is exactly ADR-0143 §8.1's failure, which is why FC-3 restates it: an approved layout
decision costing a table width, with arithmetic nobody had done. **Fixed rather than accepted** —
`ProjectCalendarsSection` takes `flush` like its two siblings, and its filter row, explainer and
error carry their own `px-6`, so what changes is the table's bleed and not the form's alignment.

**After the fix, at both widths:**

| Table                      | 1646        | 1280      |
| -------------------------- | ----------- | --------- |
| client-detail — projects   | 1104 → 1102 | 955 → 954 |
| project-detail — plans     | 1104 → 1102 | 956 → 953 |
| project-detail — calendars | 1104 → 1102 | 955 → 952 |
| **every other table**      | unchanged   | unchanged |

---

## 2. FC-3 still fails, by 2 px, and the residual is the card

The 1–3 px is `SectionCard`'s **1 px border on each side** (the 1 and 3 at 1280 are that same 2 px
landing either side of a sub-pixel column boundary). It is not padding, not a margin, and not
removable while the section has a frame: **the border is the card, and the card is what M2 adds.**

**This is not reported as a pass.** FC-3 says _no in-scope table's rendered width falls_, and three
do. Its withdrawal bar says the change that caused it is **reverted, not reinterpreted**, and
ADR-0143 is quoted in this epic's own falsification file: reading a condition's intent clause in
order to get past it is exactly the move that makes conditions decoration. Deciding here that 2 px
is "not really narrower" would be that move.

So it went to the product owner with the number, and both consequences costed:

- **Accept 2 px** — the three sections keep their frames, the estate has one section treatment, and
  FC-3 is amended in place to permit a loss attributable to a section frame, bounded at 2 px.
- **Revert M2** — the tables keep every pixel, and a named sub-section keeps **three** different
  treatments across the estate, which is half of what the epic was commissioned for.

**They accepted the 2 px** (2026-09-16). FC-3 is amended in `falsification.md` with that reason and
that bound — the bound being the measured border rather than a tolerance picked to fit, so a fourth
pixel is something other than the frame and still fails.

---

## 3. What else M2 changed

- **The `<h2>` gate assertion is live** for the first time — written and verified red at M1 against
  exactly three files, held back rather than landing knowingly red on `main`, and switched on in the
  commit that makes it true. All five assertions now pass.
- **`ProjectCalendarsSection`'s focus destination is the archetype's.** It was a `<div>` carrying
  `tabIndex={-1}` **and `outline-none`** — a focus target that suppressed its own focus indicator,
  which is WCAG 2.2 §2.4.7 and the same defect `SectionCard`'s docblock records shipping once on that
  primitive and fixing there. `id` gives it `tabIndex={-1}` **and a ring**. A unit case asserts the
  ring rather than only the `tabindex`, because a `tabindex`-only check passed against the broken
  element for as long as it existed; **verified red** against the pre-M2 shape.
- **`SectionCard` and `Card` gained a `ref` prop.** `id` alone could not replace what it was written
  to replace: `ProjectCalendarsSection` hands its region to `useCalendarScopeMove` as a
  `restoreFocusRef`, which is a `RefObject`. A plain prop rather than `forwardRef` — React 19 passes
  `ref` like any other prop and `Card` already spread its rest props onto the element, so the type
  declaration is catching up with behaviour the component had.
- **847 unit tests** across `routes`, `calendars`, `plans`, `projects` and `components/ui` pass
  unchanged.
- Sections per screen: client-detail **0 → 1**, project-detail **0 → 2**. Every other screen
  unchanged; `h1.top` still two values.
