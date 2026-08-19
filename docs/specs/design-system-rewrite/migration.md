# Migration — what lands, in what order, and what the product owner sees when

> ~989 web source files. A `VITE_` flag is **not** an operator rollback and never has been
> (ADR-0088: Vite inlines `import.meta.env.VITE_*` at build time, `apps/web/Dockerfile` declares one
> `VITE_` build arg, `docker-publish.yml` passes none, `.dockerignore` strips `**/.env`). **The
> rollback is a commit boundary**, and the sequence below is arranged so the largest, riskiest
> changes are the ones with the cleanest revert.

---

## 0. The shape, and why it is not "tokens first"

An earlier draft of this plan ran **L0 → L5**: gates, then the canvas scope, then metrics, then the
page vocabulary, then values, then docs. **That ordering is now wrong**, for two reasons that arrived
after it was written.

> **The old labels survive in the sibling documents, which were written against them.** They resolve
> as follows, and the mapping is here rather than in thirty edits because the _reasoning_ attached to
> each old label is still correct — only its position moved.
>
> | old            | now                                                                         |
> | -------------- | --------------------------------------------------------------------------- |
> | L0, L2, L2b    | **A** — foundations (gates, one theme, closure, type, metric, archetypes)   |
> | L3             | **A** — the archetypes land with the foundations, so **B** can consume them |
> | —              | **B** — the landing page, fully realised (new)                              |
> | —              | **C** — the command surface (new)                                           |
> | —              | **D** — the workspace shape (new)                                           |
> | L1, L4-1, L4-2 | **E** — the diagram: the canvas scope and its values                        |
> | L4-3…5, L5     | **F** — remaining screens, accent placement, documents                      |

1. **Removing two themes made the token work about a third of its size** (`design.md` §0.5.1). It is
   no longer the long pole it was, so putting it first no longer buys much.
2. **"I had free rein" is a bad thing to discover after forty files have changed.** The mandate has
   widened three times; the product owner needs something real to look at before all of it lands.

So the sequence is arranged around **one question: how soon can somebody look at a whole screen in
the new language?** The answer is **after two landings**, and the screen is the organisation landing
page.

| Landing                                  | What it is                                                 | Visible?                                                       | Rollback              |
| ---------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- | --------------------- |
| **A — Foundations**                      | one theme, the closure, type + metric + the six archetypes | Almost nothing                                                 | free (mostly no-op)   |
| **B — The landing page, fully realised** | **the first screen in the new language — the early look**  | **Yes, entirely**                                              | one screen            |
| **C — The command surface**              | measure, then the menubar                                  | Yes, the workspace                                             | revert a named commit |
| **D — The workspace shape**              | one band, the rail as sole navigator, the activity panel   | Yes, substantially                                             | revert a named range  |
| **E — The diagram**                      | the canvas scope, plot separations, the Gantt              | Yes, the primary view                                          | revert a named range  |
| **F1 — Controls and interaction**        | `<select>` → `Combobox`, row actions → APG `Menu`          | **Yes — and it moves affordances people know the position of** | per screen            |
| **F2 — Screens and documents**           | tables, editor, staff, public; documents re-derived        | Yes, incrementally                                             | free                  |

**A and B together are the smallest useful pair**, and they are deliberately the two with the least
risk in the epic: A is nearly all no-op re-expression, and B is a screen that does not exist yet.

---

## A — Foundations

**One landing, because the single-theme decision collapsed three into one.**

- **Collapse to one theme** (`design.md` §0.5). `.dark` deleted; `.corporate`'s values folded into
  `:root`; the two flagged value layers folded in with them; `THEME_SELECTORS` becomes a one-element
  list; `Theme` stays a union with one member; the account menu's picker is removed; the stale
  `localStorage` key is cleared once on first mount. **`theme-boot.js` keeps running and keeps its
  test** — the mechanism is live, not vestigial.
- ~~**Retire the `auth` scope**~~ — **checked, and it stays.** The check was the right
  instruction and its answer was not the expected one: 15 of 18 tokens differ from their page
  counterparts and **12 are perceptible**, led by a focus ring at Δ 0.39 that ADR-0077 M7 derived
  specifically to clear WCAG 1.4.11. Retiring it would be a visible change to the front door,
  which does not belong in a landing whose claim is that almost nothing changes. Scopes stay six.
- **The closure** (`design.md` §1.5): `--page-*` as an explicit family, `REBOUND_NAMES` computed and
  asserted rather than authored, `Card`/`Popover` as resets.
- **The gates**: the pair census (including alpha modifiers and the split-pair rule), the theme
  contract, the "no token outside a theme or scope block" assertion, the rhythm ratchet at its
  measured floor of **27** arbitrary sizing values. Each **verified red first**.
- **The type ramp and the self-hosted typeface** (`design.md` §4.0–4.1) — including the finding that
  the product had never actually chosen a typeface at all. **Landed: Space Grotesk**
  (`typeface.md`), the product owner's choice over this epic's recommended pairing, with tabular
  figures gated because that face's digits are proportional by 58 %. **It adds a task to A that was
  not here before:** with one face and no serif, hierarchy is carried by weight — and weight is
  **183 untokenised classNames across 85 non-test files** (`design.md` §4.1a).
- **Every width figure in this epic is now stale, and C is where that lands.** `typeface.md` §5:
  the toolbar ladder, the four band floors, `CHROME_RESIDUAL_PX` and `e2e-toolbar-fit`'s thresholds
  are all arithmetic over rendered text widths, and until this landed there was no stable face
  underneath any of them. The gates pass today — checked — but "passes" is not "was re-derived".
- **The metric tokens**, frozen at today's values except `--row-h` at 28 (CQ-B) and the 40 → 36
  control move (CQ-C), which is its own commit with its own measurement (below).
- **The six archetypes**: `PageContainer`, `PageHeader`, `SectionCard`, `EmptyState`, `Skeleton`,
  `ListRow`; `CardTitle` gains `level`.

**The 40 → 36 control move stays a measurement task** and keeps the six steps it had: change the
value; re-run `measure:toolbar` **at 1646**; **re-derive** the band floors rather than adjusting them
to make the existing gate pass; update `e2e-toolbar-fit` to the measured values; run every journey;
and **measure and report the vertical gain rather than asserting one**. It lands _before_ C, so the
menubar is measured against a settled control height rather than a moving one.

**What A does not do:** it does not touch the canvas, the command surface's shape, or any screen's
layout. It is the vocabulary and the archetypes, and almost all of it is invisible.

---

## B — The organisation landing page, fully realised

**This is the recommendation the coordinator asked for, and it is option (c): the landing page
becomes the first fully-realised screen in the new language.**

### The reasoning

| Why it, rather than any other screen                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **It is new.** No legacy DOM, no journey asserting its structure, no parity suite to preserve. Every other candidate — the clients list, the workspace — has all three.                                                                                                                                                    |
| **It is the screen the product owner opened this thread about**, and the one they will see first after sign-in.                                                                                                                                                                                                            |
| **Its API half is genuinely independent.** Indexes have landed and the read model is next; nothing in this epic touches either.                                                                                                                                                                                            |
| **It needs precisely the six archetypes.** Its own §0.3 lists five gaps and four of them are `EmptyState`, `Skeleton`, a section archetype with a real heading rank, and a list-row archetype.                                                                                                                             |
| **It is the right size to be a proof.** Three sections, **five** empty states of two sizes, a feed, links into the hierarchy — large enough to be real, small enough to land in one milestone. _(A metrics strip was listed here and is withdrawn: that screen's own spec rejects count tiles by name — `screens.md` §6.)_ |
| **It does not depend on the hard, slow work.** No canvas scope, no painter, no plot separation matrix, no toolbar arithmetic. It can be finished while all of that is still in flight.                                                                                                                                     |

### The condition, and it is not negotiable

**It must be built from the archetypes, not from a bespoke layout that happens to look right.** A
beautiful one-off on the flagship screen would falsify this epic's entire thesis on its first
outing — and it is exactly the failure mode `docs/specs/organisation-landing/` §0.3 was written to
avoid, one level up. If the screen needs something the vocabulary does not have, **that is a
requirement on A**, and A is one landing away rather than five.

> **Four such requirements have already been found, by reading that spec rather than trusting this
> one's list** (`design.md` §6.1). Two are real: a generic `Skeleton` block cannot satisfy
> `UX_STANDARDS`' _"skeleton and final layout identical"_ for a list of `ListRow`s, so **`ListRow`
> owns its own loading render**; and `EmptyState` as specified — _"icon, one-line explanation, one
> action"_ — describes **one** of this screen's five empty states, so it needs an optional action
> and a page-vs-section size. Both are cheap in A and are a one-off on the LCP screen if found in B.
> **This is the condition working**, and it only worked because somebody opened §4.6 — the failure
> it guards against would not have announced itself.

### What I recommend be put to the product owner

> The landing page's **data** work proceeds now, unchanged and unblocked. Its **UI** waits for
> Landing A — which is one milestone, mostly invisible, and is the shortest path to them seeing a
> whole screen designed rather than a token file. In exchange for that wait they get the first screen
> in the new language rather than the last screen in the old one, and they get it **before** the
> workspace, the canvas or the command surface change under them.

**Why not "proceed and get restyled":** a promise of "it will look better later" has a poor record
here, and the specific cost is concrete — the screen would be built against `mx-auto max-w-6xl p-6`
and hand-rolled empty states, which is a sixteenth copy of the frame and a fourth bespoke empty
state, both of which A then has to unpick. **Why not "wait for the whole epic":** it would block the
screen they care most about behind five landings, which is the worst of both.

**If the product owner would rather not wait even one landing**, the fallback is a partial A: ship
only `PageContainer`, `PageHeader`, `SectionCard`, `EmptyState`, `Skeleton` and `ListRow` — the
archetypes have **no dependency on the token work** and could land in days. That is the compromise to
offer if the answer is "sooner".

---

## C — The command surface

> **Recommended change, 2026-08-19: run C's measurement during A or B, not at the head of C.**
> Two things make the current placement uncomfortable. **C is the only landing that can be
> withdrawn by its own numbers** — the falsification condition below says so — and **D is costed
> against it landing**: `screens.md` §1.2's one-band arithmetic (~1677 against 1646, 31 px short)
> takes the collapse from 32 stops to 5 menus + 8 commands as an input, so a withdrawn C does not
> merely delay D, it removes D's premise. Second, that measurement just became more expensive and
> less predictable: **every width input to it predates a stable typeface** (`typeface.md` §5), so
> M0 is no longer "check two estimates" but "re-derive three epics' figures in the face the product
> now ships". The measurement itself needs no menubar, no renderer and nothing from A beyond the
> control height — it renders five labelled triggers and an eight-item strip into the existing
> harness. Running it early costs a day and tells the epic whether D is affordable before D is
> planned; running it at the head of C means finding out after B has shipped and the workspace work
> is next. **The build order is unchanged; only the measurement moves.**

**Measure first, and the falsification condition is written before the measurement**
(`command-surface.md` §6): render five labelled menu triggers and the eight-item strip into the
existing harness at 1646, 1440, 1280, 1024 and 768. **If the band does not fit at 1646 with ≥ 120 px
of slack, the proposal is withdrawn and the fourth-fitting option returns.**

Then, if it holds: the `menubar` primitive, the registry re-pointed (items unchanged — only the
renderer), the ladder's apparatus deleted, `e2e-toolbar-fit` re-pointed with S3 becoming "reachable
**by name**" rather than "reachable via an unnamed glyph".

Nine of thirty-three journeys touch the toolbar. All thirty-three are run.

---

## D — The workspace shape, **split in two** (product owner, 2026-08-19)

**D was one landing and is now two.** Raised by `ux-reviewer` and independently by the coordinator:
as scoped it bundled three changes to a planner's daily workflow into one overnight release — and
the host auto-pulls (ADR-0047), so "merged" means "in use tomorrow". If the result felt worse, there
would be no way to tell which of the three did it. Put to the product owner with that reasoning;
they chose the split.

### D1 — One navigator

1. **The organisation nav leaves the header for the rail** (`screens.md` §0, §3). 637 px freed, one
   navigator, one `aria-current` treatment.
2. **The band merge**, gated on the arithmetic in `screens.md` §1.2 — ~1677 px against 1646, **31 px
   short**, with two measured cuts available. **If it does not fit, the two-band fallback ships**, which
   still returns 90 px and does not depend on the nav move at all. Named up front because ADR-0092 M5
   measured a merge, found it 134 px short, and withdrew it.

**D1 owes two states the plan presented as free**, both found by `ux-reviewer` and both verified
against the code:

- **The collapsed rail.** `navigator-rail.tsx:123-148` `NavigatorRailCollapsed` renders **one button
  and nothing else**. Today the org nav survives a collapse because it lives in the header. After
  the move, collapsing the rail — which is exactly what a planner does to gain canvas width, the
  thing this whole epic chases — would hide **all six** relocated destinations behind a single
  toggle. An icon rail is the obvious answer; **nothing currently says so**, and D1 does not ship
  until it does.
- **Below `lg`.** `app-shell.tsx:143-151` renders the rail as an off-canvas `Sheet`. Today the nav is
  in the header at every width; after the move six destinations sit behind a drawer that did not
  previously stand between the planner and them.

**And one thing that is not an organisation destination at all.** `screens.md` §3 lists `My activity`
in the rail's org zone. `routes/my-activity.tsx` is `/me/activity` — no `orgSlug` — and ADR-0086 M6
explicitly recorded finding that it _"sits outside any organisation"_. It needs a decision (a
distinct non-org row, or staying in the account menu), not a silent fold-in.

### D2 — The activity editor becomes a docked panel

`screens.md` §2 — the largest behavioural change in the epic, retiring `Dialog`'s `xl` preset with
it. **Ships alone, a release after D1**, because it is the one item in the plan explicitly gated on a
UX decision _before_ the decision is taken, and therefore the one that benefits most from arriving
alone and being judged alone.

**Blocking preconditions, from `accessibility-reviewer`.** A modal `<dialog>` gives focus management
for free; a docked panel gives none of it. These are specified before code, not reviewed after:

1. Focus moves into the panel on open (`showModal()` did this; a `<div>` does not).
2. The region carries an accessible name — `role="region"`/`"form"` with `aria-labelledby` naming
   the activity — or a screen-reader user loses the modal's implicit "dialog: Edit activity X".
3. An explicit polite announcement on open. A modal's arrival is inherently perceivable; a
   non-modal panel's is not.
4. **Escape precedence decided explicitly.** ADR-0064/0079 already built a deliberate Escape stack
   for the canvas (tool → open pick → selection) with a target guard. The panel is a **fifth**
   claimant. Decided in the plan, not left to whichever listener fires first.
5. Focus returns to the triggering row/control on close.
6. Tab order between the panel, `PanelResizer` and the canvas's ADR-0026 D7 listbox is specified —
   the background stays operable, which is the whole point, so a keyboard user tabbing out of the
   last field must not land mid-edit somewhere unoriented.
7. The narrow-viewport sheet fallback **keeps** the trap the wide layout deliberately gives up: a
   sheet does cover the canvas, so it is modal in fact and must be modal in behaviour.

**And a mount-lifecycle answer, from `performance-reviewer`.** The prose describes the container and
not the lifecycle, and two materially different designs satisfy it: conditionally rendered (mounts
when an activity is being edited — no regression), or always mounted and hidden (four scope forms'
RHF watchers, `Combobox` debounced searches and TanStack Query hooks live and re-rendering behind
the canvas's rAF loop for as long as the workspace is open). The plan must say which, and ship a
render-count regression test in the shape of ADR-0026 D7's invariant.

**A dialog-shaped guard that a panel removes.** ADR-0060 M6 built regression tests for confirmation
before discarding unsaved work across three independently-dirty scopes. That flow is backdrop-click
and close-button shaped. A docked panel removes the thing it guards — named here as a required task
rather than discovered by a failing suite (`test-engineer`).

---

## E — The diagram

The canvas scope, byte-identical on arrival (`--canvas-*` declared at today's resolved values,
`resolveTsldPalette(root)` pointed at the `<Surface tone="canvas">` element, and **`resolvePrintPalette`
with it** — the one that will be forgotten). Then the plot values: the criticality triple re-separated
so the reported figures clear the ≥ 1.5:1 floor, the gate promoted from reporting to asserting in the
same commit. Then the Gantt's chart region, ruler and rows.

`apps/web/scripts/measure-link-routing.mjs` runs before and after, and the numbers go in the
milestone record. This epic must leave `docs/TECH_DEBT.md` #75 **measurable**; it must not quietly
become the epic that answers it.

---

## F — The remaining screens, the controls, and the documents

> **F is now two landings, and this is a change of shape rather than a change of size.** The product
> owner's decision of 2026-08-19 — _"the scope on existing screens is **controls and interaction**,
> not paint"_ — turns the back half of this epic from a restyle into a **correction of interaction
> that has drifted from the documented standard**. Counted rather than estimated: **~20
> `<SelectField>` call sites across 10 non-test files** plus a further ~15 raw `Select`/`<select>`
> usages, and **~10 tables carrying bare per-row text actions** (`CalendarsTable.tsx:233-281` alone
> renders five buttons per row) where `docs/UX_STANDARDS.md` "Row / node actions" specifies the APG
> row menu. Each conversion changes the **accessibility tree** and therefore the locators of the
> journeys over it — which is a different risk class from changing a colour, and it does not belong
> in the same landing as the documentation sweep.

### F1 — Controls and interaction

The `<select>` → `Combobox` conversions and the row-action → `Menu` conversions, each carrying the
ADR-0082 reason wiring so a shaded action keeps its explanation. Journeys are re-run per screen, not
at the end.

**Two things must be decided before the first conversion, and neither is decided today.**

1. **A discriminator for `Select` vs `Combobox`.** `combobox.tsx:12-15` states its own reason for
   existing narrowly: _"a native `<select>` cannot do what a library picker needs at scale —
   type-ahead filtering against the server, a 'load more' page, and options that carry a tier/state
   annotation"_. A dependency type (FS/SS/FF/SF), a constraint type or an accrual type has none of
   those properties, and replacing a four-option native select with a hand-rolled listbox is
   replacing a correct control with a heavier one. The decision named the **library screens**
   specifically; the principle behind it is general, so the general form needs a written rule or it
   will over-apply. **Proposed:** a `Combobox` when the option set is server-paged, searchable, or
   annotated; a native `Select` otherwise.
2. **What a hand-rolled combobox costs on a touch device.** A native `<select>` gets the platform's
   own picker — the iOS wheel, the Android sheet — which is the single best mobile control in the
   product and is free. A `Combobox` gets an in-flow listbox competing with a virtual keyboard.
   `design.md` §3.3 resolves `comfortable` density under `@media (pointer: coarse)`, so this
   collides with a decision this epic has already taken, and `docs/TECH_DEBT.md` #133 records that
   **no toolbar measurement in this repository has ever been taken with a coarse pointer**. This is
   an `accessibility-reviewer` and `ux-reviewer` question **before** the conversions, not after.

### F2 — The documents

`docs/DESIGN_SYSTEM.md` **re-derived from the gates**. Its drift list has grown since this was
written and two entries are now **live rather than pending**, because Landing A shipped underneath
them:

- §268 says _"There are five scopes"_ — it is six.
- §272-277 explains `brand` and `auth` as _"theme-invariant, identical in Light, Dark and
  Corporate, because a signed-out visitor cannot choose a theme"_. **There is no Light and no Dark.**
  That paragraph is not stale-in-waiting; it describes a mechanism the product no longer has, in the
  governing document a reader consults before touching a scope.
- §284 says `--card` is _"not one of the 17 rebound names"_ — the family is 18 base names, and with
  the closure it is 29.
- Plus the original list: the unused `text-3xl` page-title size, the 36-vs-40 control scale, a
  `DataTable` described with five features it does not have, and §230's "three scopes" against
  §267's "five".

`CLAUDE.md` §16 and `docs/adr/README.md` gain ADR-0097 **in the same commit as the ADR file**,
because `scripts/check-counts.mjs:55` re-derives the count from `docs/adr/`.

> **F2 is the one part of this epic with a reason not to be last.** Everything else in F is a change
> to the product; this is a correction to a document that is **wrong today** about a mechanism that
> **changed today**. Every other landing has a reader in the meantime.

---

## What gets worse

1. **This is now a large, visible, multi-landing change to a product in daily use.** The product owner
   runs the Watchtower profile, so every release reaches their host (`CLAUDE.md` §17). The sequence
   above is the mitigation: A is invisible, B is a new screen, and the surfaces they use every day
   (C, D, E) come after they have seen and approved the language.
2. **The command surface reshape may be withdrawn by its own measurement**, after the measurement
   milestone is spent. That is the correct outcome if the numbers say so, and it is budgeted.
3. **The activity-editor panel is a workflow change, not a styling one.** If planners dislike it, the
   revert is real work, not a token flip.
4. **`--row-h` at 28 makes Landing A non-byte-identical** for the Gantt (32 → 28), which takes
   `test:e2e:gantt` and `measure:gantt` with it.
5. **Removing dark is an accommodation removed** (`design.md` §0.5.6). Not a WCAG failure, the product
   owner's call — and §0.5.4's one-sentence cost is what keeps "revisit later" honest.
6. **`globals.css` still grows**, though far less than before: **six** families at **29** names each
   (18 base + the eleven the closure pulls in), plus packs plus metric, type, elevation and motion —
   but **once**, not three times. **Both of those numbers moved after this line was written**: `auth`
   was measured and stays (§A), and the closure grew a family by 61 %. The net is still a reduction —
   174 declarations against 270 — but it is a little under two thirds, not the third that the
   pre-closure arithmetic implied, and `design.md` §0.5.1 carries the re-derivation.
7. **Nine journeys touch the toolbar and every screen migration touches a suite.** All thirty-three
   are run at C, D and F. ADR-0091 records three broken by a label change, each found by CI rather
   than locally.

---

## What this epic must still not do

- **Answer `docs/TECH_DEBT.md` #75.** Leave the canvas budget measurable; re-run the harness.
- **Adjust a toolbar band floor so the existing gate passes**, instead of re-deriving it. That
  converts a measured floor into a remembered one, silently.
- **Ship a beautiful one-off on the landing page.** The condition in B is the epic's own thesis
  applied to itself.
- **Let the single theme become a hard-coded theme.** `design.md` §0.5.3's gate is the whole of what
  keeps a future dark variant to "a block of values and one entry".
