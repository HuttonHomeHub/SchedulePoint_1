# ADR-0104: A shell control whose subject is an organisation is withheld where there is none

- **Status:** Accepted
- **Date:** 2026-08-22
- **Deciders:** Product owner; shaped by `ui-architect`, gated by `ux-reviewer`,
  `accessibility-reviewer` and `component-reviewer`, and checked afterwards by an independently
  written Feature Spec (`docs/specs/org-less-shell/`).

## Context

Three of the thirteen routes under `_authed` are not organisation-scoped — `/onboarding`,
`/account` and `/me/activity` — and the app shell rendered the Project Explorer on all three:
**~298 px of drawer at 1646 px, saying _"Select an organisation to browse."_**, above a 40 px
actions row that was empty because its only child needs a slug. On `/onboarding` that sat beside a
card asking the reader to create their first organisation, where there is nothing to select by
definition, on the first screen a new member ever sees.

**The rule was not missing; it was applied to four controls and not their fifth.** In the same 48 px
rail: `app-header.tsx`'s below-`lg` Explorer trigger is already `{shell && orgSlug ? … : null}`;
`tool-rail.tsx` already withholds the six organisation destinations, under a test titled _"renders
no destinations outside an organisation — there are none to show"_; `BrandLink` branches on
`orgSlug === undefined` and points at `/`; `OrgSwitcher` returns `null` with no organisations. The
Explorer's panel button sat forty lines from the destinations block, ungated. That is the
ADR-0064 §7 / ADR-0093 shape this register keeps recording, at the instance where the standing rule
says extract rather than repeat.

**The cause sat one layer below the symptom.** `AppShell` called `useExpansionState(orgSlug ?? '')`,
so every org-less route wrote a `schedulepoint-nav-expanded:` key — expansion state for **an
organisation named empty string**. The shell did not model "no organisation"; it modelled "an
organisation whose slug is blank", and each of its six consumers then degraded on its own. Nobody
had decided the case: `docs/adr/0029-persistent-hierarchy-navigator.md` contains no mention of it.

## Decision

**We will derive the absence once, in the shell, and route every consumer through it.**

`ShellFrame` derives two values: `explorerAvailable` (`orgSlug !== undefined`) and `drawerOnScreen`
(`!drawer.collapsed && (showingContext || explorerAvailable)`). The drawer column, the Escape rung
and the below-`lg` `Sheet`'s `open` all read them. `ToolRail` derives the same fact from the
`orgSlug` it already holds. `NavigatorRail` **requires** `orgSlug`, and `useExpansionState` takes
`string | undefined` and persists nothing when it is absent.

**The control is omitted, never shaded** (ADR-0082's third omit clause: nothing to show at all).
The objection worth answering is that a reader on `/account` with three organisations _can_ change
the state — they cannot change it **here**: choosing one in the switcher navigates elsewhere, and
that switcher is two rows up the same rail, unshaded, already being that affordance. A reason
sentence would have been the very sentence this defect is about, moved somewhere quieter.

**The answer is the same on all three routes, keyed on the route and never on memberships.** The
independent check supplied the argument that settles it, and it is mechanical rather than
aesthetic: memberships come from `useOrganizations()`, a **query**, so a membership-keyed rule is a
_deferred_ rule — the shell would paint without the panel and add it a beat later, moving ~298 px
on every `/account` load. Route params resolve with the match.

## Alternatives considered

- **Shade the control with a reason.** Rejected. ADR-0083 reached the _opposite_ conclusion for
  form fields, and the generalisation that reconciles both is: **shade what the reader came to read
  and cannot act on; omit what has no content at all.** A panel whose entire content would be a
  refusal is the second case. Shading also adds an `aria-disabled` tab stop offering a refusal on
  every non-organisation screen, on a rail a keyboard user already traverses before reaching
  content.
- **A guard at each call site.** Rejected — that _is_ the defect. Four consumers need the term, and
  writing it four times is the bet that lost here.
- **Route `staticData` declaring `orgScoped`.** Rejected on three counts: it encodes an author's
  intent beside a data requirement, and the two can diverge; it fails silently in both directions
  on the next route added, whichever way it defaults; and `staticData` appears nowhere in
  `apps/web/src`, so it would be a first. `orgSlug`'s presence is not an inference — every
  organisation-scoped route carries `$orgSlug` in its path **and** `ensureOrgMembership` in
  `beforeLoad`.
- **Root the Explorer at the last-active organisation** so the navigation navigates
  (`lib/active-org.ts`). Rejected, and this was the strongest alternative. It breaks ADR-0029's
  stated invariant that selection is a pure projection of the URL, so the tree and the switcher
  40 px away would disagree about which organisation you are in — confidently wrong beating absent,
  the wrong way round. It cannot help `/onboarding` at all, so the withholding rule is needed
  regardless, leaving two rules discriminated by a fact the reader cannot see. And nobody is
  stranded without it: the brand tile resolves to the last-active organisation and the switcher
  offers every one.
- **Fill the drawer with an org-less subject** ("Your organisations"). Rejected: it invents an
  undesigned second navigator, duplicates the switcher 40 px away (ADR-0093's defect, which has a
  structural gate against it), and still spends the 298 px.
- **Passing `explorerAvailable` into `ToolRail` as a prop.** Shipped first, then reversed by the
  component review. The rail already held `orgSlug` and already derived the identical condition one
  cluster along, so `<ToolRail orgSlug="acme" explorerAvailable={false} />` typechecked — two guards
  for one fact that can silently stop agreeing, which is this ADR's own defect moved one level down
  into a prop list.

## Consequences

- **Three screens gain ~298 px** and their content re-centres. The rail on `/onboarding` becomes a
  48 px strip holding the brand tile and the account chip, which is the honest content: there is
  nothing to navigate, and the account menu is the reader's only exit and the correct one.
- **A future org-less route is covered by construction.** The rule is derived from the route param
  rather than from a list, so any route added under `_authed` without an `$orgSlug` inherits it the
  day it is written. A structural gate for this was proposed by the independent plan and
  **deliberately not built** for that reason; the failure direction is also the safe one, since a
  route whose param were named differently would withhold rather than wrongly show.
- **The Escape rung had to move with it, and that is the sharp consequence.** It guarded on
  `drawer.collapsed` alone, so with the preference set to open and nothing available to show, an
  Escape on `/account` called `drawer.collapse()` — persisted to `localStorage` through an effect —
  and announced _"Project Explorer closed."_ when nothing was open. The reader's panel preference
  would have died on a trip through their account settings, with the evidence arriving later, on a
  plan, saying nothing. A fix that suppressed the Explorer by _collapsing_ the drawer rather than by
  not rendering it would have passed every other assertion and shipped exactly this. Proven by a
  test verified red, and asserted against a `Storage.prototype.setItem` spy rather than the resting
  value, because a rule that collapsed and then restored would leave the right value on disk having
  written the wrong one.
- **`focusRailButton` gained a last rung that is unreachable, and is labelled as such.** A callback
  ref fires with `null` on unmount, so a withheld button would leave `'explorer' → null` and
  `button?.focus()` a silent no-op — the WCAG 2.4.3 class this register has recorded three times. A
  test for it was written and **withdrawn**: `.remove()` leaves a truthy, detached element in the
  map, so `focus()` silently does nothing and the rung is still not reached, which incidentally
  proves the map is only ever correct because React fires the ref with `null`. It stays as a named
  invariant guard, to be re-reasoned the day the `'context'` subject regains a registrant
  (`docs/TECH_DEBT.md` #156).
- **Three unit suites had to change, and that is most of the answer to why nobody saw this.**
  `app-shell.test.tsx` mocked `useParams: () => ({})` and then asserted the Project Explorer
  navigation **is** present; `drawer-entry-point.test.tsx` had the same default;
  `navigator-rail.test.tsx` pinned the "Select an organisation" hint itself. The area's suites used
  the broken state as their fixture, so every reviewer read those assertions as describing the
  product. This is one layer past ADR-0081: not a capability with no entry point, but **a defect
  with a suite that pins it**, where the fixture and the defect are the same thing and nothing can
  tell them apart from inside.
- **The CPM engine is not imported and no migration runs**, so the ADR-0034 recalculation parity
  gate is untouched by construction.
- **Left open, filed rather than absorbed:** `docs/TECH_DEBT.md` #168 (below `lg`, Escape still
  closes and announces a drawer the reader cannot see — a guard disagreeing with a CSS class,
  excluded because fixing it changes behaviour on a viewport the new journey does not drive), #169
  (the actions row still renders empty for a Contributor or Viewer on every organisation route), and
  #171 (`schedulepoint-active-org` is never cleared and carries no user id — found while costing the
  rejected alternative).
- **This ADR's own process failure is part of its record.** It was built without a Feature Spec or
  an Implementation Plan, and the parent epic's approved spec says of the milestone that produced
  it that its output is register rows _"and the work it may generate is specified after it runs"_.
  The spec was produced afterwards, deliberately, as a **check** — written by `feature-analyst` in
  an isolated worktree pinned to the pre-change commit and blind to the implementation, because a
  spec written with the solution in view rationalises it instead of testing it. It reached this
  design independently and found four things the implementation had missed, two of which are fixed
  above. See ADR-0105 for the rule that exists so this is not decided by judgement next time.

## References

- `docs/TECH_DEBT.md` #165 finding (a); #168, #169, #171 raised by it.
- `docs/specs/org-less-shell/` — the Feature Spec and Implementation Plan, written after the build
  as a check and labelled as such.
- `docs/DECISIONS.md`, 2026-08-22 — what the check agreed with, corrected and found.
- ADR-0029 (persistent shell; selection is a projection of the URL), ADR-0064 §7 and ADR-0093 (one
  correct pattern applied to a control and not its neighbour), ADR-0082 and ADR-0083 (omit vs
  shade), ADR-0081 (a milestone names its entry point), ADR-0098 (per-user client storage).
