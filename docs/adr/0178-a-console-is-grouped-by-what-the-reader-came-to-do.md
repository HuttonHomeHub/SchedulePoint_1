# ADR-0178: A console is grouped by what the reader came to do

- **Status:** Accepted (2026-10-06, at M4's close). Filed Proposed at M2; the grouped layout, values,
  Refresh and announce-on-change shipped in M3, and D-3 (Performance folded at rest, its history read
  hoisted to the panel root) shipped in M4 with the split of the probe panel.
- **Date:** 2026-10-06
- **Deciders:** James Ewbank (product owner — approved the spec 2026-10-06: one page with an "On this
  page" jump list rather than tabs, Performance folded by default, a Refresh with an honest note),
  with Claude Code
- **Amends:** ADR-0143 D1, D2, D3 and D4
- **Extends:** ADR-0145 D1 (the archetype set)
- **Builds on:** ADR-0086 (audited reads), ADR-0111 (keyboard contracts reviewed before release),
  ADR-0132 (event versus standing condition), ADR-0135 (focus handed back), ADR-0082 and ADR-0083
  (shaded, not disabled), ADR-0088 D1 (no flag)
- **Spec:** [`docs/specs/staff-console-redesign/`](../specs/staff-console-redesign/feature-spec.md)
  §4.6, §4.8; `docs/TECH_DEBT.md` #458

## Context

`/staff` grew a panel at a time, each correct against the ADR in force when it was written, and the
page that resulted was reported by its owner as "very messy". Three reviews the same day (UX,
accessibility, component) found the causes were structural, not cosmetic:

- **Eight sibling `h2`s of equal weight**, so a reader could not tell the things that need them from
  the tools they may never use.
- **The same three-state machine, the same sub-heading, the same Copy button and the same
  collapsible written by hand several times**, each a little different (four Copy wordings, six
  sub-heading treatments, two `aria-expanded` disclosures with different mechanics).
- **A summary that named a problem but not its value, and sorted by severity**, so the same row
  landed somewhere else on each visit.

M2 ships the primitives that remove the repetition. This ADR records the decisions they carry and the
ones the following milestone builds on them.

## Decision

**D1 — Heading rank is derived from where a section sits, never passed per call.** A
`HeadingLevelContext` defaults to `2`. A `SectionGroup` is an `h2` and supplies `3`; a `SectionCard`
supplies its own rank plus one to its body. `SectionCard` outside any group renders **exactly the
DOM it always did**, which a test pins, because seventeen other screens depend on it. The rank type
stops at `h4`: the console has nothing deeper, and the type has no `h5` to reach for.

**D2 — The archetype barrel gains `SectionGroup`, `SubSection` and `KeyValueList`** (it already
gained `StatusSection` and `QueryPanel` in M0). `SectionGroup` is an **unnamed `<section>`**, not a
landmark: every `SectionCard` inside it is already a named region, and a group that was one too would
nest a landmark around each of them. `SubSection` is the one sub-heading treatment, and the staff
archetype gate now refuses a hand-rolled `<h3>`/`<h4>` on the surface (one file is a named exception
with a pinned count: its heading names its own section and takes programmatic focus, which
`SubSection` does not do; M3 moved both headings onto the context rank and the exception is gone). `KeyValueList` is a `<dl>` for
settings, replacing badges used for settings.

**D3 — `components/ui` gains `Disclosure`, `ConditionStrip` and `CopyButton`.**

- `Disclosure` promotes `CoverageDisclosure`'s mechanism (a `<button aria-expanded aria-controls>`,
  never `<details>`, ADR-0145 D5) with a **required** `collapsed: 'described' | 'hidden'`. `described`
  keeps prose that another element describes into in the accessibility tree; `hidden` does not render
  controls and detail nobody describes into, because invisible focusable content fails WCAG 2.4.7. A
  default would let the second kind of content receive the first kind's treatment by omission.
- `ConditionStrip` is `Alert purpose="condition"` (ADR-0132) with a verdict word, one sentence and an
  optional **How to fix** disclosure; it has no bold lead-in (ADR-0097's weight ratchet).
- `CopyButton` wraps `useClipboardCopy` with **one wording** ("Copied." / "Couldn’t copy. Select the
  text and copy it yourself."), a **visible** confirmation (not a live region: the hook already
  announces), and a shaded-with-a-visible-reason state when there is nothing to copy. It never sets
  `pointer-events-none` at rest (`docs/TECH_DEBT.md` #458); the hover fill is cancelled instead.
  Adopted at the four staff-surface Copy sites. `ShareLinksDialog` and `InviteMemberDialog` are out of
  surface and left alone.

**D4 — `QueryPanel` replaces the three-state vocabulary** (amends ADR-0143 D4): pending shows the
caller's own **skeleton** (loading stays a per-shape rule, so the skeleton is a required prop), error
shows `QueryErrorState` with Try again and **withholds data**, data renders. Earlier data stays visible
with `aria-busy` while a refetch is in flight; the moment the read fails the error wins.

**D5 — Smaller shared changes.** `Badge` gains `outline` for "Checking" and "Could not be read", states
that are neither good nor bad (contrast pair asserted in `token-contrast.test.ts`). `DataTable`'s
`Column` gains `wrap: 'anywhere'`, composed like `width`, with no `cellClassName` merge (ADR-0145 M4
declined that). `formatRelative` and `exactInstant` move to `lib/relative-time.ts`.

**D6 — Decisions M3 builds on the above** (recorded here so the amendments to ADR-0143 have one home;
each is implemented and tested at M3, which is when this ADR is accepted):

- ADR-0143 **D1**: each summary row carries a **value** and its **own** destination, and rows keep
  the **page's fixed order** rather than severity order — position no longer has to carry severity
  once the headline names what needs attention.
- ADR-0143 **D2**: panels announce on **change**, not on first settle, with one page-level sentence
  when the page has loaded.
- ADR-0143 **D3**: span-by-demand is kept, inside groups, with the one pair in "This installation".
- **In-page navigation is a non-sticky "On this page" list** (a sticky one covers a phone viewport and
  can hide the focused target, WCAG 2.4.11).
- **Technical names (environment variables, log keys) live only in "How to fix".**
- **One Refresh, with an honest audit cost:** it re-reads exactly the six page reads, each of which is
  an audited row (ADR-0086); there is no per-panel refresh.
- **A collapsed tool keeps its read observer mounted**, so folding it away never writes another audit
  row on expand.

**D7 — The Performance box folds, and what that costs (M4).**

- **Folded on arrival, not remembered.** One summary sentence ("Measures how quickly this browser
  draws a schedule."), then either the last sitting as a tally ("Last measured 3 days ago on the Dell:
  4 passed · 2 ungraded.") or "Not measured on this installation yet.", then **Open performance
  tools**. The tally states counts and ranks nothing (the history already refuses to). The machine is
  the operator's label, else "a machine that was not named": the reading may be another staff
  member's, so "this browser" would be a claim nobody checked.
- **Not a `Disclosure`**, because the button's label changes with its state (Open, then Hide). It sets
  `aria-expanded` and `aria-controls` as the primitive does, renders the content only while open
  (controls nobody can see fail WCAG 2.4.7), and is **shaded with a reason while a run covers the
  screen** (`aria-disabled`, never native `disabled`, ADR-0083).
- **The history read stays at the panel root**, beside the screen's own observer of the same key, so
  opening makes no request and the page's reads stay at six. The sweep's state (selection, machine
  label, the last sitting) lives in a hook above the fold and survives Hide and Open.
- **It opens by itself when the tools must be mounted:** arriving at, or following, `#performance`
  (which also focuses the box), and a pending, stale or malformed plan-loading marker. That press
  reloads the page twice and the section that resumes it is inside the fold; a box that arrived folded
  would let the marker expire and throw the reading away silently.
- **A long run speaks every eight seconds** between its step boundaries (`useAnnounce`), so a single
  press is no longer silent from "Step 1 of 1" to the verdict (`docs/TECH_DEBT.md` #259 item 11).
- **Its copy lives in `features/perf-probe`**, since that feature may not import `features/staff`, and
  the SC-9 gate (`copy.structural.test.ts`) now reads the probe's UI files too. "Measure one thing" is
  a `Disclosure`, so the page has one sub-heading treatment.

## Alternatives considered

- **Tabs.** Hides conditions behind a click, contradicts ADR-0143 D1, and brings the `Tabs` keyboard
  contract into scope.
- **A `status` prop on `SectionCard` instead of `StatusSection`.** The live region is a console
  behaviour with seventeen other `SectionCard` consumers; a separate archetype keeps their DOM
  byte-identical.
- **A heading `level` prop on `SectionCard`/`SubSection`.** The same decision made at every call
  site, in a mistake that is invisible on screen and falls on screen-reader users.
- **Moving `aria-disabled` shading into `buttonVariants`.** Fifty-one files including the Gantt
  toolbar; out of scope, left for its own register row.
- **`<details>` for `Disclosure`.** A closed one was measured to deliver no accessible description
  (ADR-0145 D5).
- **A `VITE_` flag.** ADR-0088 D1: it cannot be switched off on the published image.

## Consequences

- One more heading level on `/staff`, and `SectionCard` has a context dependency (a default that
  changes nothing outside a group).
- Four Copy buttons say the same thing the same way, and a shaded one says why in visible text. The
  `e2e-staff` assertion that read "Report copied." reads "Copied." and the unit tests that matched the
  four long refusal sentences match the one.
- The staff archetype gate now covers sub-headings; a new hand-rolled one fails it.
- `Disclosure`, `SectionGroup`, `SectionCard`'s heading context, `SubSection`, `ConditionStrip` and
  `CopyButton` change keyboard, focus or heading semantics, so **accessibility-reviewer runs before
  release** (ADR-0111).

## References

- ADR-0143, ADR-0145, ADR-0132, ADR-0111, ADR-0082, ADR-0086
- `docs/specs/staff-console-redesign/feature-spec.md` §0, §4.6, §4.8
