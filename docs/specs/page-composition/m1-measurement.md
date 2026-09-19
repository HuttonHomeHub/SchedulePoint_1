# Page composition — M1 measurement

**Status:** Complete
**Taken:** 2026-09-17
**Baseline:** `m0/drift-*.json`. **After:** `m1/drift-*.json`. Same fixture, same sitting.

---

## FC-1a — one declared measure: **PASS**

| Computed `max-width` | Screens                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `1536px`             | `org-home`, `clients`, `client-detail`, `project-detail`, `calendars`, `resources`, `members`, `audit-log`, `recently-deleted`, `my-activity`, `staff` |
| `672px`              | `account` — the declared exception, unchanged                                                                                                          |

Eleven screens, one value. The baseline was **two** values (`1152px` × 9 and `1536px` × 2).

## FC-1b — screens sharing a shell region agree: **PASS**

Two regions, each internally consistent. At 1646 the nine org-scoped screens render 1369 (the
region binds) and the two outside the shell render 1536. That 167px is the Project Explorer and no
measure can remove it, which is why FC-1 was restated at M0 rather than softened at M8.

## FC-3 — monotonic non-regression: **PASS**

Frame widths, before → after. Nothing regressed at any width.

| Screen                         | 1280            | 1646            | 1920            |
| ------------------------------ | --------------- | --------------- | --------------- |
| the nine in-scope              | 1003 (=)        | 1152 → **1369** | 1152 → **1536** |
| `my-activity`                  | 1152 → **1280** | 1152 → **1536** | 1152 → **1536** |
| `org-home`, `staff`, `account` | (=)             | (=)             | (=)             |

**+217px at 1646** — the number M0 predicted, to the pixel, against the spec's `+204`. At 1280 the
region already binds, so the change is correctly worth nothing there.

## FC-6 — reflow at 320px: **PASS (unchanged)**

Every in-scope screen still overflows by **0px**. `staff` still overflows by **251px**, exactly as
at M0 — pre-existing, not touched, and recorded so it cannot later read as a regression.

---

## What the journey found, on its first run

**The `flush` alignment fix did not work, and only a browser could say so.** The heading and the
first cell were still exactly 24px apart. The first implementation expressed the inset as arbitrary
variants on the edge cells (`[&_td:first-child]:pl-6` and siblings), keeping the body `p-0` so row
backgrounds stayed full-bleed.

`cn`/`tailwind-merge` was **ruled out by running it** — the class survives into the DOM
untouched — so the cause lies between that and the generated stylesheet. **It is not established,
and no cause is asserted**: the shipped form (`px-6 py-0` on the body) removes the question rather
than answering it, and inventing an explanation would be a claim nobody checked.

The shipped form is also the better design. The plan proposed making the _heading_ full-bleed so
the two agree — which aligns them at the one x-position where text touches a border, i.e. it would
have delivered the product owner's complaint rather than its fix.

**And the journey's own first version was wrong too**: `contentWidth` measured between navigation
and paint, because `goto` resolves on `load` and a SPA renders after it. It threw "no page frame
found" on a perfectly correct screen. It waits for the `<h1>` now.

---

## Two things recorded rather than smoothed

**The count is passed on four screens and withheld on two, and the difference is honesty, not
taste.** Clients, Calendars, Resources and Recently deleted load every page (`apiFetchAllPages`), so
the length IS the total. Audit log and My activity are `useInfiniteQuery` behind a "Load more",
where the same expression means "how many are loaded" — a number that would read as a total and be
wrong by however much history the reader has not asked for. ADR-0098's rule, one noun along.

**The journey's shard is over budget on an estimate, not a measurement.** `check:e2e-roster` charges
an unmeasured suite the largest measured duration, so shard 1 projects at 822s against a 593s
budget. The real run takes **32s**. The gate prints the projection and does not assert it; the
figure will correct itself when durations are next measured.

---

## The gates that shipped with it, each verified red

- **`page-frame.structural.test.ts`** — every screen that renders rows renders a section. Verified
  red by unwrapping `ClientsTable` (`routes/clients.tsx` reported).
  **Its first two versions were both wrong**: the first asserted at FILE level and flagged eleven
  table components whose frame is supplied by the route that renders them; the second resolved
  imports with a `.tsx`-only walk, so every barrel (`index.ts`) was invisible and the closure of
  every screen was empty — caught by its own pinned case, which is what that case is for. The third
  flagged `routes/share.tsx`, which was a **true** report of a **false** premise: that table is in
  `ShareLinksDialog`, a member-facing overlay the guest route never renders. A dialog is not a page
  list, so that is now a stated discriminator with `ShareLinksDialog` pinned as its case.
- **The width census** in `page-container.structural.test.ts` — an explicit `width` is a declared,
  reasoned exception. Verified red by giving `routes/clients.tsx` an undeclared `width="narrow"`.
