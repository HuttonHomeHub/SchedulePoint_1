# Page composition — M3 (filters and controls) and M4 (Members)

**Status:** Complete
**Taken:** 2026-09-17

---

## M3 — what the filter bar's problem turned out to be

The product owner reported the audit log's filters as "out of place and not designed to be part of
the page". Two things were true and only one was framing.

**The filter bar does not overflow.** M0 re-derived the spec's quoted "~246px over at every width"
and found `overflowsBy: 0` at 1280, 1646 and 1920 — it wraps onto three lines and stands **122px
tall**. That is a different defect from the number implied, and M1's frame addressed the framing
half by putting the bar inside the section it filters rather than in a box of its own (the judgement
`AuditFilterBar` had already made and recorded).

**The sharper half is that the bar held two control vocabularies.** `ToggleChip` unpressed is
`border-input rounded-full` — a bordered pill. `SegmentedControl` unselected was
`text-muted-foreground`: no border, no fill. Same row, same job, 20px apart. **With no outcome
chosen — the default state — all three options were bare text beside four pills.**

### M3-T1 — a track, not a boundary per option

**This departs from the plan, which asked for a boundary on each option.** Three borders inside a
bordered group is the comb ADR-0065 M3 describes one surface along. The group takes a `bg-muted`
track and the selected option is raised onto `bg-background shadow-sm` — so the state is carried by
fill _and_ elevation rather than by hue alone (WCAG 1.4.1), and an unselected option is identifiable
because the track around it is.

`bg-muted` is reused rather than minted. ADR-0100 M4 records a token pair absent from
`@theme inline` painting **nothing** in a real browser while the contrast gate stayed green, because
that gate resolves `:root` names and never asks whether the utility compiles.

**Nothing about the keyboard model moved**, and the proof is that the existing 13-test suite passes
**unchanged**: roving `tabindex`, Arrow/Home/End, focus-follows-selection, `aria-checked` and the
unselected-group tab-stop rule are untouched. Sent to `accessibility-reviewer` and
`component-reviewer` **before release**, per CLAUDE.md §19.13 — the class that shipped wrong twice in
two days, the second time inside the fix for the first.

### M3-T2 — the search field is bounded

Measured on the deployed Clients screen, it rendered **970px wide** for a single-term name search —
the widest thing on the page, wide because every caller passes `flex-1` and nothing else was in the
row to take the slack. A default `max-w-md`, overridable, `max-w-*` and never `w-*` so the wrap at
narrow widths survives (FC-6).

### M3-T3 — the disclosure looks like a control

"What this records" rendered as a bold phrase on its own line with nothing beneath it — visually a
heading with missing content. A `ChevronDown` now rotates with `aria-expanded`. **Only the visual
layer changed**: `aria-expanded`, `aria-controls` and the `sr-only`-not-`hidden` rule are untouched,
those mechanics having been established by a CDP measurement recorded in the file's own docblock,
and the existing 88-test suite passes unchanged.

---

## M4 — Members, both halves

The product owner answered "both" to two-column **or** richer sections, so it is both.

**`PageGrid` with spans by demand**: the roster is a five-column table and takes the full width;
invitations and the roles panel are narrow and pair with each other.

**`Joined` cost nothing.** `OrgMemberSummary.joinedAt` has been on the wire the whole time and was
never rendered — "who is in this organisation" and "since when" are one question to anybody auditing
a roster, and the screen answered half of it. `fit`, and through the shared `formatTimestamp` rather
than a per-render `Intl.DateTimeFormat`, which ADR-0144's gate pass records as a real defect.

**One plan claim was wrong and is corrected here.** M4-T1 said both `joinedAt` and `expiresAt` were
"already on the wire and unrendered". `expiresAt` **is** rendered — inside the invitations Status
cell, as "Expires <date>" — so only half that task existed. Checked by reading
`InvitationsSection.tsx:89-100` rather than by trusting the sentence.

**The roles panel is not filler, and the test for that is whether it answers a question the screen
raises.** It does: the roster's `Role` select and the invite dialog both offer four words — Viewer,
Contributor, Planner, Org Admin — and **nothing anywhere in the product said what they mean**.
Somebody inviting a subcontractor had to guess whether "Contributor" could move a date. The copy is
taken from `docs/PROJECT_BRIEF.md` §5 rather than written fresh, because a second description of the
permission model is a second thing to keep in step. Roles are listed **most-capable first**, which is
the reverse of the picker's order, because a reader arrives asking "is this too much?".

**The permission omission is now pinned.** `members.tsx` has always omitted Pending invitations
entirely for anyone who is not an Org Admin (ADR-0082's first omit clause) and **nothing asserted
it** — which is how a permission boundary quietly becomes a layout detail the next refactor removes.
`routes/members.composition.test.tsx` asserts it, verified red by making the section unconditional.

### M4-T2 — the summary strip is WITHDRAWN

Decision 4 was "summary rows where they earn their place", and the test the plan set was whether a
strip says something the first page of rows does not.

On this screen it does not. The roster's own section heading already carries a count (M1), the
pending-invitation count is one number beside a one-row table, and the composition by role is
visible in the `Role` column of every row. A strip restating them would be decoration, and it would
cost vertical space above the list — which FC-8 exists to prevent.

Withdrawn rather than deferred: **a decision not to build is a result**, and there is no work owed
here. If an organisation ever has enough members that the roster pages, the composition stops being
visible and this becomes a real question again.

---

## The two specialist reviews, folded

Both ran **before release** rather than at the gate pass (CLAUDE.md §19.13), and they converged on
one blocking defect from opposite directions.

### The segmented control's resting treatment was wrong, and every instrument agreed it was fine

The first version distinguished selected from unselected by **fill alone** — `bg-background` raised
out of a `bg-muted` track.

- **accessibility-reviewer** computed that pair with the project's own resolver: **1.01–1.26:1
  across all seven surface scopes**, `panel` at 1.01 and `canvas` at 1.02, against WCAG 1.4.11's
  3:1. The only other channel was `shadow-sm`, whose _theoretical ceiling_ (an opaque, unblurred 10%
  black over the fill) it computed at 1.08–1.25:1.
- **component-reviewer** reached the same place from the tokens: `--muted` is **lighter** (L 0.965)
  than `--background` (L 0.914) on this theme, so the "raised" option was in fact the darker one —
  and `tabs.tsx:140,169` already expresses this exact motif correctly with `bg-card` over `bg-muted`.

**Nothing could see it.** `token-contrast.test.ts` had no pair for `--muted`/`--background`. The
control's 13 unit tests are about the keyboard model. And the journey assertion written for this
very change checked `backgroundColor !== 'transparent'` — **which passes at 1.01:1 exactly as
happily as at 21:1**. A gate that cannot fail for the defect it was written for is not a gate
(ADR-0110 D5), and that one could not.

Fixed by making the boundary `--input` — the token this system reserves for a control's own outline
and gates at 3:1 for that reason (ADR-0055 §1) — on the track and as a ring on the selected option,
with a scope-safe `bg-background` fill.

**`bg-card` was tried for that fill and refused by `reset-fills.structural.test.ts`, correctly.**
`--card` is a reset pinned at maximum lightness in every scope — which is what made it attractive
and what makes it wrong, since this control can be mounted inside any `<Surface>` and would paint
white on the navy chrome band. So the fill is not the accessible channel and is not asked to be: the
ring carries 1.4.11 and the fill reinforces it. **No scope-safe fill pair in this system clears 3:1
against `--muted`**, which is why the first version failed and why a border was always going to be
the answer — a conclusion neither review reached, because each was arguing about which fill to use. The pair is now in
`NON_TEXT_PAIRS` and passes. The journey now asserts the group's border width and colour at rest
**and** the selected marker after a click; its first rewrite failed against a correct control,
because the outcome filter arrives with **nothing selected** — which is the state the whole finding
was about.

### The skeleton's column widths, measured

The component review predicted that a `fit` column cannot size a skeleton, because `fit` works by
making a cell's min-content width equal to its text's width and the skeleton has no text. Measured
in Chromium on Calendars at 1646, and it was worse than predicted:

| Column                 | Loading  | Settled |
| ---------------------- | -------- | ------- |
| `Working days` (`fit`) | **16px** | 190px   |
| `Actions`              | **0px**  | 160px   |
| `Name`                 | 628px    | 738px   |

The skeleton's `<th>` renders no text at all — deliberately, it is placeholder material — so a `fit`
column had nothing to fit and collapsed to its 1px floor. The width classes are now withheld from
the skeleton, and it distributes evenly (424/424/424) instead of collapsing.

**A residual reflow remains and is a stated cost rather than a defect to hide.** `Name` moved 314px
before this epic and still does: the skeleton has never matched the settled table for any column
without a fixed width. What the fixed caps did was give two columns parity **by making both wrong** —
the cap that stabilised the skeleton is the same cap that wrapped the content. `fit` makes the
settled table right and leaves the skeleton a generic placeholder. Closing the gap properly means a
content-shaped skeleton, which is separate work: `docs/TECH_DEBT.md` #341.

**And the fix was half-applied for one round**, because a string replacement silently failed to
match (prettier had collapsed the JSX onto one line) and nothing asserted that it had. I re-measured
and drew a conclusion from the half-applied tree before noticing. That is the fifth instrument
fault in this epic and the first that was mine twice over.

### Other findings folded

- The `flush` docblock the plan named by name — "a table that already has its own padding", which is
  false — survived at `client-detail.tsx:73-74` and was corrected, with `project-detail.tsx`
  annotated to match.
- The primitive's claim that `flush` leaves "no gap above" is **16px**, not zero. Corrected.
- `bounded` contradicted the spec, which said "truncation with the full value available". The spec
  is corrected toward the code and the reason written down: truncation hides content, and this epic
  spent M0 establishing that a reader mistakes even a _deliberate_ ellipsis for a cut-off sentence.
- `Column.width` had **no coverage of its own** — `bounded` none at all. Four unit assertions added,
  covering each value, the no-op property of `auto`, and composition with a caller's classes.
- The audit log declared `auto` on **three** columns, not four; `Outcome` was the silent member of a
  rule about not being silent. Declared. The M2 record's count is corrected in place.
