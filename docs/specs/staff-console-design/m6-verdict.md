# M6 — the verdict, measured in one sitting

**Status:** Approved
**Taken:** 2026-09-15, Chromium, 1646 × 1000, §4.7 unhealthy recipe, one sitting.
**Instrument:** a one-off probe (`#165(e)`) driving the real product at `/staff`.

## 1. The two guards ran before any verdict was printed

**The `<h1>` guard.** The harness asserts the heading reads "Staff console" and **throws** otherwise,
because M0's first run reported `FC-1: 0 of 5 → FAIL` **from the sign-in screen**, in the format of a
real result. An instrument that cannot tell "the condition is absent" from "I am on the wrong screen"
is worse than none.

**The non-vacuity control.** Both conditions the recipe _turns on_ — `MAIL_SMTP_URL` unset and
`RETENTION_SWEEP_ENABLED=false` — must be present or the run is refused. The two ambient ones
(`MAIL_ALERT_URL`, `HEARTBEAT_URL`) are reported and can satisfy nothing, because they are empty by
default on every boot (CLAUDE.md §17) and M0's control passed against a **healthy** API by finding
exactly those.

Both passed on every run below.

## 2. FC-2 is measured in ONE sitting, which is the only way it means anything

`m0-measurement.md` §10 recorded the baseline drifting **+555 px on its own** with no product change,
because two of the page's tables only grow — and staff activity grows by roughly seven rows _every
time the console is opened_, including by the harness. So the before and after are taken minutes
apart against the same database: `git checkout 4c923ef5 -- apps/web/src`, measure, restore, measure.

|                                |     before |    after A |    after B |
| ------------------------------ | ---------: | ---------: | ---------: |
| Document height                | **15,286** | **12,770** | **12,696** |
| FC-1 conditions above the fold | **3 of 5** | **5 of 5** | **5 of 5** |
| Narrowest table                |    **798** |  **1,438** |  **1,438** |

The after-A/after-B spread is **74 px (0.6 %)** — the harness's own drift, and an order of magnitude
below the 2,516 px delta, which is what makes the verdict a verdict rather than noise. Reporting the
spread is not decoration: ADR-0128 records a machine whose no-change baseline moved by more than the
bar, and that run was honestly called INDETERMINATE.

## 3. All five conditions

| #         | condition                                                                                     | baseline  | measured                                                                                  | verdict  |
| --------- | --------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------- | -------- |
| **FC-1**  | every non-healthy condition named or counted within the first viewport                        | 3 of 5    | **5 of 5**                                                                                | **PASS** |
| **FC-1a** | `StaffStatusSummary` precedes every section in DOM order; each condition links to its section | —         | first section is `Status`; **5 links**; every target resolves and carries `tabindex="-1"` | **PASS** |
| **FC-2**  | document height ≤ the baseline, same state                                                    | 15,286 px | **12,696–12,770 px (−16.4 %)**                                                            | **PASS** |
| **FC-3**  | `weightSites()` outside `components/ui/` **falls** from 173; arbitrary sizing stays ≤ 17      | 173 / 17  | **168** (ratchet set to it; 167 fails naming 168) / **17**                                | **PASS** |
| **FC-4**  | no table narrower than the 798 px it measures today                                           | 798 px    | **1,438 px (+80 %)**, every table                                                         | **PASS** |

FC-1's detail at 1646, as scroll-position of each condition's own sentence against a 1,000 px fold:

| condition                   |        M0 |     now |
| --------------------------- | --------: | ------: |
| no mail transport           |       194 | **235** |
| failure alerting off        |       325 | **775** |
| heartbeat off               |       325 | **775** |
| retention sweeping disabled | **1,562** | **298** |
| unverified accounts         | **2,445** | **361** |

The two that failed are now the second and third things on the page, because the summary states them
rather than the reader having to reach the panel that owns them. That is the epic's justification
measured at both ends.

## 4. What the verdict does NOT establish

- **One width.** 1646 is the product owner's own screen and the width ADR-0091's retrospective
  established two whole epics had never measured at, so it is the right one — but 1280 and 1440 were
  measured only at M0, and the page's responsive behaviour below `md` is untested by this instrument.
- **One database.** The performance panel holds roughly fifteen accumulated sittings on this machine;
  an installation with none renders a much shorter page, and one with fifty renders a longer one.
  FC-2's ratio is not portable.
- **FC-2 remains the weakest of the five**, for the reason §6 of the plan gives and `m0-measurement.md`
  §10 gives independently: two columns shorten a page by construction. It is reported because it was
  committed, not because it decides anything. **FC-1 decides this epic, and it failed at M0.**

---

## 5. The gate pass — four reviews, three blocking, and what the assertions could not see

Six blocking findings across ux, accessibility and component (frontend-performance passed, having
re-derived the bundle figures from clean builds at both ends of the diff: **+557 B gzip** on the
entry graph, and `/staff` still lazy and dependency-free in its own chunk). Every fix below carries a
regression test **verified red against the shipped code first**.

**Two of the six were found independently by two reviewers, and both sit in the same gap: every
assertion this epic wrote checked a MECHANISM and none checked an OUTCOME.**

### 5.1 The alerting row linked to a section that says nothing about alerting (ux, component)

`CHECK_SECTION_ID.alerting` pointed at the Installation card. Installation renders the API version,
the environment, the mail host and the staff count; the alerting and heartbeat badges, and the two
sentences naming `MAIL_ALERT_URL` and `HEARTBEAT_URL`, are in the health card. So a reader who saw
_"Failure alerting — Needs attention"_ and activated the row was moved to, and focused on, a section
containing nothing about what they had just been told.

**This epic's own headline feature, with the mechanism built correctly and pointed at the wrong
place.** And nothing could see it: the model suite asserted `sectionId.length > 0`, the component
suite asserted the href matched `/^#staff-section-/`, and the journey asserted the target carried
`tabindex="-1"`. All three pass against a link pointing anywhere at all.
`check-answers-its-link.test.tsx` asserts the pairing from a **subject vocabulary** rather than from
a second copy of the mapping — a test that restates `CHECK_SECTION_ID` agrees with whatever that file
says and proves nothing.

### 5.2 The headline called "still loading" and "could not be read" the same thing as "needs attention" (ux)

The sentence folded everything that is not `HEALTHY` into the words "need attention". So **on every
ordinary page load, before any of the four queries had settled, the console's first paint read "5 of
5 checks need attention: mail delivery, retention sweeping, …"** — an alarming, false claim on the
one screen whose job is answering _is anything wrong right now?_, and a direct contradiction of the
module's own docblock, which says in as many words that a console answering that question wrongly
while a request is in flight is worse than one that says nothing.

The badges were right throughout, which is why neither file looked wrong: the per-check channel and
the aggregate channel disagreed, and only the aggregate was false. **Every existing sentence
assertion was for the all-healthy case or for a per-check sentence** — so the whole suite passed
through the fix unchanged, which is the finding rather than a reassurance. The two states are named
verbatim in the spec's own edge-case table and had no test.

### 5.3 `SectionCard` deleted the focus indicator from the element it had just made focusable (component)

§8.4 widened `SectionCard` with `id` + `tabIndex={-1}` precisely so a section could be a focus
**destination**. It shipped applying `focus-visible:outline-none` with no replacement — so a keyboard
reader following "jump to the section that answers this" landed with no visible sign that they had
(WCAG 2.2 §2.4.7, AA). Every other focusable primitive in `components/ui/` pairs `outline-none` with
a ring; this was the one exception, in the one place the epic created a focus target. The classes
were also **unconditional**, so three overview sections that pass no `id` — and are therefore not
focusable at all — carried focus styling for a behaviour they do not have. Both halves fixed.

### 5.4 Two caveats the epic's own record called wired were not (accessibility)

`m5-every-element.md` listed "all four `aria-describedby` caveat targets" as kept. Two were: the
retention notes, and the policy caveat this milestone moved. The mail-transport note — which explains
why the counts read as healthy — and the `audit_events` note — which says the most sensitive table in
the system is deliberately not swept — carried no `id` and were referenced by nothing. Unchanged from
the pre-epic code, so not a regression, but **the record describes a shipped state that did not
exist**, and it is a claim about accessibility, which is the one subject this register has overstated
before and corrected. Both are wired; the test asserts **resolution** — every id a region names is on
the page — rather than placement.

### 5.5 Two smaller ones, and one that was promised and not built

A refusal to copy said so only in the live region at the two dialog sites, while every staff panel
converted in the same milestone renders a visible sentence for both outcomes — **the review's
namesake failure landing inside the task meant to remove it**. `InviteMemberDialog` cleared every
piece of per-invitation state on close except the clipboard's, so copy → close → invite somebody else
reopened with the button reading "Copied" about a link it had never touched. And spec §8.3 promised
the archetype gate would refuse a hand-rolled page grid on this surface; it was never added, so the
specific regression the spec named — an author reaching for `grid grid-cols-2` instead of `PageGrid`,
silently giving up the DOM-order guarantee — was guarded by nothing. Delivered.

### 5.6 Two claims of mine the reviews disproved by counting

"The one paired row: four facts beside **three** controls" — `DiagnosticsPanel` renders two. Written
in `m2-frame.md` and copied into `staff.tsx`'s comment, so it appeared twice and was disprovable by
counting: the ADR-0076 class this epic cites elsewhere, committed by its own author. And
`archetypes.structural.test.ts` still said `ListRow` is "not this screen's shape", which M3 made
untrue by reusing it for the summary — the gate only ever asserted presence, so nothing failed and
the comment simply went stale.

### 5.6b The seventh defect, found by the journey on the first run after the fix

Sending the alerting check to the section that answers it (§5.1) left `InstallationPanel` holding
`CHECK_SECTION_ID.alerting` as its **own** `id` — so two sections carried `staff-section-health`,
which is invalid and makes every anchor to it ambiguous. **One correct pattern applied to a control
and not its neighbour, committed inside the commit fixing an instance of exactly that.**

`scripts/e2e-local.sh web:staff` caught it immediately (`strict mode violation: resolved to 2
elements`) and **no unit test could have**: each component test renders its own subtree, and the
collision exists only in the composed page. The cheap version now exists beside it — a route-level
assertion that no two elements share an `id`, which runs everywhere in milliseconds — and it is
verified red against the exact state that shipped for the length of one commit.

`InstallationPanel` now carries no `id` at all, which is the honest state: `id` is what makes a
section a focus target, and after §5.1 nothing links there.

### 5.7 Recorded rather than fixed

- **`DataTable`'s `cellClassName ?? default` replaces rather than merges**, which is the primitive-level
  cause of the padding loss §2 records fixing locally. **Measured before deciding: 30 call sites
  override it, and about a dozen right-aligned action columns appear to drop `pr-4` deliberately** —
  so merging is a shared-contract change with a real blast radius, which ADR-0105 says needs a spec
  and ADR-0136 says must not be folded into an epic's last milestone. `docs/TECH_DEBT.md`.
- **Two `warning` badges on Installation** — "Email verification: off", "Edit lock: off" — correspond
  to no check in the five-item vocabulary, so a reader who trusts "nothing needs attention" and stops
  reading never learns they are flagged. Filed rather than folded, because whether a configuration
  fact is an operational condition is a product question, not a gate-pass fix.
- **Both new expression-scanning gates see only literal JSX**, so an `empty={someVariable}` or a
  `className={someVariable}` escapes. Not exploited anywhere today (checked), and now named in each
  docblock rather than left as an unstated blind spot — ADR-0131's rule about a gate not quietly
  reading less than it claims.
- **The bundle floor's drift predates this epic**: `bundle-budget.json` was measured 2026-09-11 and
  the **pre-epic** commit already stood ~18.5 kB above it, of which this epic spent 557 B. Filed so
  the next small change is not blamed for drift it did not cause.
- **Two deviations from the approved plan, recorded because a plan is a claim too.** The grid order
  puts Accounts before the Installation/Diagnostics pair rather than in the plan's Band B, because
  Accounts is one of the five derived checks and Installation is not. And the summary links retention
  to the merged card rather than to the subsection §8.12 asked for — the only choice that works: just
  the outer `SectionCard` carries `tabIndex={-1}`, so an anchor to the inner `<h3>` would move the
  viewport and leave focus where it was, silently dropping the guarantee the link exists for.

### 5.8 One claim left open rather than closed

The §8.13 checklist says "the whole row is the target" for a summary link, and the accessibility
review is right that the anchor wraps only the check's label — the trailing badge and the sentence
beneath are outside it. The reviewer declined to cite SC 2.5.8 without a browser measurement, which
is the correct restraint: the pattern is copied verbatim from `NeedsAttentionSection`, an already
shipped and reviewed component this epic cites as its precedent, so any defect predates it and the
`block` this diff adds makes the target wider, not narrower. Left as an open measurement rather than
recorded as met, because "verified by reading" is what this register keeps having to correct.
