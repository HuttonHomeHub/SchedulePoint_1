# ADR-0098 — The landing is the organisation overview

- **Status:** Accepted (M0–M5 landed 2026-08-19; **no feature flag** — the screen replaces its
  predecessor rather than sitting beside it, and the rollback is a commit boundary)
- **Date:** 2026-08-19
- **Supersedes:** nothing
- **Amends:** ADR-0029 (the shell's workspace region now has a landing worth the name), ADR-0055 S1
  (the wordmark in the chrome band becomes a link)
- **Builds on:** ADR-0012/0016 (RBAC + tenancy), ADR-0028 (the pen, which the attention section
  reports), ADR-0072/0073 (the audit log, and why this screen is **not** built on it), ADR-0082
  (omit vs. shade, applied at section granularity), ADR-0096 (retention, whose countdown this
  surfaces), ADR-0097 Landing A (the page archetypes this screen is assembled from)
- **Spec:** [`docs/specs/organisation-landing/`](../specs/organisation-landing/)

---

## Context

`/orgs/:slug` is where **every sign-in lands** — `router.tsx`'s index route resolves to the
caller's last-active organisation, and there is no other default. What it showed was a centred card
reading "Welcome to SchedulePoint / Select a plan from the Project Explorer to view its schedule",
over a decorative ruler-and-TODAY backdrop.

That card describes the rail one column away. It answers no question a planner arrives with, and
the two they actually do arrive with — _what has moved since I was last here_, and _is anything
waiting on me_ — had no answer anywhere in the product.

It also carried a **second screen nobody had ever seen**: a `VITE_NAV_TREE`-off branch rendering
"The schedule editor arrives in an upcoming update", roughly a year after the editor shipped. A
`VITE_` constant is inlined at build time and no published image passes one (ADR-0088), so that
sentence was unreachable in every deployed bundle — and an unreachable screen does not go stale
harmlessly, it goes stale **invisibly**, so the next person to design this route reads a screen
that does not exist. It was deleted with the flag rather than corrected (M0).

---

## Decision

### D1 — The landing is the organisation overview

One `<h1>` (the organisation's name) and three sections: **Jump back in**, **Recently changed**,
**Needs your attention**. Not a settings page, not a report, not a product tour.

### D2 — "Recently changed" is derived from row attribution, over three tables

The ordering key is `GREATEST(plans.updated_at, newest activity, newest dependency)` — **not**
`plans.updated_at`, which does not move when an activity is edited. An ordering on the plan row
alone ranks a plan somebody has been working in all morning below one whose name was corrected last
week, and **every row on the screen still looks correct**, which is what makes it worth a decision
rather than a bug fix. The attribution comes from whichever row won.

**D2a — `plans.schedule_computed_at` is excluded.** It moves on every recalculation, which makes it
tempting, and it is **unattributed**: there is no `recalculated_by`, so a row won by it would say
"this changed" with nobody's name against it.

### D3 — Names resolve through `org_members`, never through `users`

The resolution join is the control and not a convenience: through `users`, this endpoint would turn
any user id in the installation into a display name. An id that is not a current member of **this**
organisation resolves to nothing, and the reader is told "A former member" — which is also the
honest answer, since somebody who has left is exactly who a missing row usually is.

`changedBy` is therefore a **discriminated union**, never a nullable name: `MEMBER`,
`FORMER_MEMBER` and `UNKNOWN` are three different facts, and a nullable string collapses the last
two into an absence a reader cannot tell from a defect.

### D4 — Sections and counts the caller may not read are **omitted**, never zeroed

"Needs your attention" is not rendered at all for a Viewer or a Contributor — no heading, no empty
box, no shaded placeholder. That is ADR-0082's "when every item would be shaded, show no trigger at
all", applied one level up at **section** granularity: a Viewer cannot take the pen, cannot invite
and cannot restore, so a section addressed to them personally would be a permanently empty frame on
the first screen after every sign-in.

The same rule runs through the payload. `pendingInvitationCount` is absent without
`invitation:read`; `expiringDeletedCount` is absent unless the caller may restore **and** hierarchy
retention is armed on this host. **A zero is a fact about the organisation; an absence is a fact
about the reader**, and sending `0` to a Contributor tells them there is an answer they may not
have. Every read is gated **before it is issued**, not issued and filtered — filtering afterwards is
correct, still pays the cost, and leaves the next refactor one line from a leak.

### D5 — "Jump back in" stores ids, never names

Up to five plans per browser, per account, per organisation. The store holds **ids and a timestamp**
and the server supplies the names on every load. That is the load-bearing half: it is what makes a
rename correct itself, a deleted plan vanish, and a plan the reader has lost access to disappear
silently rather than 404 on click. A cached name would do none of those, and the one occasion it
would be used is the one occasion nobody has checked it.

**D5a — The key carries the user id, and sign-out sweeps that account's entries.** The query cache
dies with the tab; `localStorage` does not. Without both halves a shared machine hands the next
account the previous one's plan names — commercially sensitive strings, on the first screen after
sign-in, caused by nothing anyone did.

**D5b — The ids ride on the request the screen is already making.** No second round trip on the
coldest path in the product. The journey **measures** that rather than asserting it.

**D5c — The four ways an id can fail are indistinguishable.** Deleted, another organisation's,
unreadable and never-real produce a byte-identical response. There is no `reason` field, no
partial-failure list and no dropped count, because any of them turns this into an existence oracle
for every plan in the installation, reachable by any member with no permission beyond their own.
The API e2e asserts it by comparing whole payloads, not by asserting three empty arrays — an oracle
is a **difference**.

**D5d — An ARCHIVED plan IS offered here**, though it is excluded from "Recently changed".
Archiving is how a planner says "stop showing me this" about the organisation's work; this list is
the reader's own history, and a planner who archives the plan they have been in all morning should
not be stranded.

### D6 — The wordmark is the route home, at the header call site

`BrandMark` is rendered by both `app-header.tsx` and `brand-panel.tsx`, and the link is added at
the header **only**. The public screens have no session and no organisation, so a link inside the
primitive would put one on the sign-in door pointing at a route the guard bounces the visitor out
of. The accessible name **contains** the visible text ("SchedulePoint — organisation overview"), so
WCAG 2.5.3 Label in Name holds, and it carries `aria-current="page"` on the landing — the
affordance the removed nav item provided.

### D7 — "Overview" leaves the nav **after** the page has content

The sequencing **is** the decision (M5 after M2 and M4). Removing the only labelled route home
while the destination was still a blank welcome card would have been a regression wearing a
cleanup's clothes. Restoring the item is a one-line revert, and this says so rather than pretending
the choice is permanent.

### D8 — No feature flag

Three reasons in order of weight: a flag here selects between two whole screens, which is
ADR-0088 D2's **Class A** shape, and the estate reached `classACap: 0` two epics ago; ADR-0088 D1
established that a `VITE_` flag cannot be switched off on a deployed image, so it would not be an
operator rollback whatever a docblock claimed; and the rollback that does exist is `git revert` of
one commit. ADR-0061 and ADR-0077 both shipped structural surface changes unflagged on the same
reasoning.

### D9 — No audit event, and the reason is written down

A landing-page read is not a governance act. ADR-0073's two tests — durability and blast radius —
both answer no. It is recorded here rather than left as a silence because the route census reflects
over controller metadata and can see this decision in neither direction, so it is a **rule with a
reason** rather than a gate (the ADR-0087 D-note precedent, and the ADR-0072 `ENGINE_DERIVED`
mistake not repeated).

### D10 — Six sections were considered and rejected, by name

Because the tempting dashboard is the one nobody argued about.

1. **"At a glance" count tiles.** Rejected — they answer no question a planner has, the Project
   Explorer already shows the tree one rail away, and a number that only goes up is decoration
   within a week. The single most common dashboard mistake, worth naming rather than quietly not
   building.
2. **"Assigned to me".** Rejected as **not derivable**: `Resource` has no user link, so
   SchedulePoint genuinely does not know whose activities are whose. The tempting proxy,
   `activities.updated_by`, means "who touched this last" — shipping it would be a confident false
   statement on the first screen after sign-in.
3. **Portfolio health** (late plans, negative float). **Deferred, not rejected** — the most
   valuable future section and the most expensive, since rolling it up is a per-plan schedule read
   on the LCP path. Its own milestone, and its own measurement.
4. **Cross-plan staleness.** Rejected for this screen: it needs upstream-closure resolution per
   plan, and the plan's own summary already surfaces it where it is actionable.
5. **Charts.** Rejected — no charting dependency exists and adding a component library is an
   ADR-level decision (ADR-0006). A screen that answers two questions does not need one.
6. **A true activity-level feed** ("Sarah added _Pour slab_ and 11 others"). Rejected **and named
   as the thing not being built, so nobody promises it later.** It is what a reader actually wants,
   and row attribution structurally cannot give it: the row says who wrote last, not what they did,
   and a deleted row is simply gone. Getting it means an event table or widening the audit log, and
   ADR-0073 §3 excludes content edits **permanently**, on purpose.

---

## Consequences

**The screen is assembled from the ADR-0097 archetypes, and that is a gate.**
`archetypes.structural.test.ts` asserts it reaches for all six and hand-rolls none of what they own
— the page frame's measure and padding, a page title's type treatment, a section heading's rank. A
bespoke frame that happens to match today's archetype looks identical on screen and drifts the
first time either changes, which is a defect nobody can see. Verified red against a hand-rolled
`mx-auto max-w-6xl` + `<h1>` before being trusted.

**Two archetypes changed because this screen needed them to**, which is the condition working
rather than a compromise: `PageContainer` gained a `narrow` measure (at the default, a plan's name
and the time it changed sat ~800px apart at 1646, so pairing the two facts the row exists to pair
cost a saccade across half an empty screen), and `SectionCard` became a **named `<section>`** — a
`region` a screen-reader user can jump between. The second arrived from the journey rather than a
reviewer: the same plan legitimately appears in both sections saying two different things, which is
a test's problem only until you notice a reader has the same one.

**Nothing here touches the CPM engine**, no migration runs, and the ADR-0034 recalculation parity
gate is untouched by construction — in its honest form, there is nothing to hold parity for.

### What the journeys found that no unit suite could

Three of this epic's four claims are structurally invisible to a suite that hands the component its
own payload, and each was a finding rather than a formality.

- **The pen is released on nav-away.** The obvious journey navigated to the overview and asserted
  the held lock, and failed — `use-plan-edit-lock.ts:168-184` releases the lease on unmount and
  `pagehide`. The product was right: a pen you left is not one you hold, and reporting it would be
  the false statement this screen exists to avoid. The shape that produces a held lock is the real
  one — the plan open in one tab, the overview in another.
- **A third spec was still asserting the deleted welcome card**, in `e2e-edit/` — found by the
  full-suite sweep and **not** by a grep, because the first grep covered `src/` and `e2e/` and the
  suite lives in `e2e-edit/`. Two more were in the base journey. None of the three is named for
  the screen it lands on: all were asserting a fixed string as a proxy for "we arrived". The
  replacements assert the **organisation's own name**, which is the stronger claim.
- **The request counter counted its own source files.** `includes('/overview')` reported **19**,
  because the Vite dev server serves this feature's modules from `/src/features/overview/…`. A
  harness that miscounts is worse than no harness: it produces a number, and numbers get believed.

### Three defects in my own gates, recorded because the pattern is the finding

- **A vacuous gate.** The assertion that the public panel renders no wordmark link was written in
  `public-screens.landmarks.test.tsx` and **passed against a real injected link** — those tests
  mount the screen components and never the panel, and the "SchedulePoint" it matched was sign-in's
  own description copy. Moved to `brand-panel.test.tsx`, asserted against the DOM rather than by
  role (the panel is `aria-hidden`, so a link inside it is invisible to `getByRole` and still
  focusable, which is a WCAG 4.1.2 defect in its own right), and **verified red**.
- **A gate that counted its own documentation.** ADR-0097's weight ratchet scanned raw file text,
  so a docblock explaining a weight decision scored as placing one — writing down the reasoning
  pushed the gate towards failing. Third occurrence of a scan matching prose in this repository.
  See `docs/DECISIONS.md`, 2026-08-19.
- **`forgetAllForUser` used `Object.keys(storage)`**, which works only because the Web Storage API
  happens to expose stored keys as own enumerable properties. The map-backed `Storage` in the unit
  test is a conforming implementation, and the sweep silently matched nothing.

### Two copy defects found by reading the diff rather than by a failure

The page description said "What has been happening, and what is waiting on you" to **every** role,
and nothing is waiting on a Viewer or a Contributor — they never see that section at all. A
description is announced with the heading, so it was the first thing a screen-reader user heard
about a screen they were not looking at. It is now role-aware.

And `PageHeader` wired `aria-describedby` to a **hard-coded id**, a latent duplicate-id defect in a
primitive that does not get to assume anything about its call sites. `SectionCard` already used
`useId()`, which is what made the inconsistency visible.

### Known limits, stated rather than worked around

- **"Recently changed" cannot show a deletion.** A soft-deleted row is excluded from the read, so
  deleting an activity can _lower_ a plan's position with nothing saying why.
- **"Jump back in" is per-browser.** A second device shows nothing, and the section is simply
  absent. Syncing it means per-user server state, which is exactly what the section exists to
  avoid.
- **Only the latest writer is shown.** Row attribution is last-writer-wins and the copy must never
  imply otherwise — the §2 copy contract exists to keep the strings inside what the data supports.
