# M1 — the widened sweep, run against the unfixed product

**Taken:** 2026-09-19, one sitting, local dev servers, `scripts/e2e-local.sh web:page-composition`.
**State:** the remedy is **not built**. This is the gate reporting the live defect.

**This is ADR-0110 D5 in its strongest available form.** Every other gate in this repository is
verified red against a _mutation_ — a deliberate edit that makes correct code fail. This one is
verified red against **the product as it ships**, because the defect it was written for is still
there. No mutation was needed and none was used.

```text
wrap sweep: 24 screen-widths examined, 7 declared-auto wrap(s) tolerated, 9 finding(s).
  tolerated: audit-log@1280 By      (auto) "composition-…@example.com"
  tolerated: audit-log@1280 By      (auto) "composition-…@example.com"
  tolerated: audit-log@1280 Subject (auto) "invited-…@example.com"
  tolerated: audit-log@1280 By      (auto) "composition-…@example.com"
  tolerated: audit-log@1280 Subject (auto) "composition-…@example.com"
  tolerated: audit-log@1280 Event   (auto) "Organisation createdSucceeded…"
  tolerated: audit-log@1280 By      (auto) "composition-…@example.com"
  FINDING:   members@1280 Email  (undeclared) "invited-…@example.com"
  FINDING:   members@1280 Sent   (undeclared) "19 Sept 2026, 16:57"
  FINDING:   members@1280 Status (undeclared) "Expires 26 Sept 2026, 16:57"
  FINDING:   members@1646 Email  (undeclared) "invited-…@example.com"
  FINDING:   members@1646 Sent   (undeclared) "19 Sept 2026, 16:57"
  FINDING:   members@1646 Status (undeclared) "Expires 26 Sept 2026, 16:57"
  FINDING:   members@1920 Email  (undeclared) "invited-…@example.com"
  FINDING:   members@1920 Sent   (undeclared) "19 Sept 2026, 16:57"
  FINDING:   members@1920 Status (undeclared) "Expires 26 Sept 2026, 16:57"
```

## FC-1 — the widened gate sees today's defect: **PASS**

Nine findings, **all on Members, at all three widths, and nowhere else** — which is clause 2
verbatim. 24 screen-widths were examined and each asserted a non-empty cell count before any
verdict, so "no finding elsewhere" is a statement about screens that were looked at.

**It found a column the register row did not name.** #344 said two columns, `Sent` and `Status`.
It is **three**: `Email` wraps at every width too. That is the row's **third** correction, and the
first that came from the gate rather than from a person re-reading a measurement — which is the
argument for the gate in one line.

## FC-2 — the widened gate does not fire on a legitimate wrap: **PASS**

Seven wraps on the audit log at 1280 were **tolerated**, every one carrying `data-col-width="auto"`
— a column whose author wrote down that it may wrap and why. Not one appears as a finding.

This is the condition the epic could most easily have failed. A sweep that reported all sixteen
would fail on day one against three deliberate declarations, and a gate that does that gets switched
off rather than fixed (ADR-0058).

**The tolerated count is printed on every run, green or red, deliberately.** A run tolerating seven
and a run that saw none are different facts, and only the first means the exemption is doing
anything. Without it, deleting the exemption logic would look identical to a clean estate.

## Two instrument failures on the way, both mine

**1. The first version died at the twentieth navigation and blamed the product.** It looped widths
outermost and did 24 full `goto`s; Chromium reported `net::ERR_INSUFFICIENT_RESOURCES` and served a
blank body, which surfaced as `members@1920: no h1`. Members at 1920 visited on its own is perfect —
established by a standalone probe before anything was changed. The dev server ships hundreds of
unbundled ES modules per navigation and the browser ran out of budget. It now navigates **once per
screen and resizes**, which is eight navigations, and is closer to what a reader does anyway.

**2. My first diagnostic probe was wrong in the way this very file warns about.** It counted `<h1>`
immediately after `goto` and reported _every_ screen as broken — `goto` resolves on `load`, which
for a SPA is before the route has rendered anything. `contentWidth`'s docblock in
`composition.spec.ts` records the identical mistake being made once before. The corrected probe
found no failure at all, which is what pointed at resource exhaustion rather than at Members.

Both are why the sweep now prints the screen, the width, the URL, the body text and the last console
events on any failure: a 24-point sweep that says only "no h1" costs a re-run to learn the one fact
that matters, and here it cost three.

## One product defect found by the fixture, not by the sweep

Seeding an invitation for the first time made the journey's `Members shows three named regions`
assertion fail with a strict-mode violation: **two regions named "Pending invitations"**. The
`SectionCard`'s title and the `DataTable`'s caption were the same string, and `DataTable` renders a
focusable scroll region labelled by its caption — so with rows present, an AT user hears one name
for two different things. With no rows there is no scroll region, which is why nothing had ever
seen it.

The roster beside it already does it right: section **Roster**, table **Organisation members**. The
invitations table's caption is now **Invited people**. _(A first attempt also renamed the
focus-return assertion, which is about the **section** and not the table. The suite caught it.)_
