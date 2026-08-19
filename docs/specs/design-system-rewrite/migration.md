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

1. **The organisation nav leaves the header for the rail** (`screens.md` §0, §3). **540 px** freed
   (re-measured 2026-08-19; see `m0-landing-d1-measurement.md`), one
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

### E's shape, decided before it is built

**The pair to fix is `--warning` vs `--destructive` at 1.34:1**, not `--primary` vs `--destructive`.
`diagnosis.md` §3.3 leads on 1.27:1, which was a **Light-theme** figure and went with its theme; the
values that survived the collapse are the old Corporate row, re-derived there 2026-08-19. And the
ground is **1.02:1 against the page**, which is why the trap has never shown: two greys nobody can
tell apart. Both figures are recomputed in that section rather than restated here.

**How the element reaches nine call sites is the one real design question, and it is not
prop-drilling.** The resolvers are called in three places that cannot see the diagram's DOM node at
the moment they run:

| caller                                | when it runs                             | can it see the container?                                              |
| ------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------- |
| `TsldCanvas.tsx:669,675,687` (`??=`)  | during the **first render**              | **No** — `containerRef` is declared on the next line                   |
| `TsldCanvas.tsx:1555,1558,1559`       | a passive effect keyed on `themeVersion` | Yes, but after a paint — and with one theme that key never fires again |
| `TsldPanel.tsx:1081,1086` (`useMemo`) | during render, **above** the canvas      | **No** — the canvas is its child                                       |
| `use-diagram-image.ts:103`            | on demand, off the render path           | Only if something hands it one                                         |

**And the provider sits higher than the first draft assumed.** `resolvePrintPalette` is reached from
`use-diagram-image.ts`, which is called by `useTsldToolbarContext`, which is called from
`plan-workspace-toolbar.tsx:282` — i.e. from a component **above `TsldPanel`**, not below it. So a
context published by the `<Surface tone="canvas">` element itself cannot reach it, and neither can
one published inside `TsldPanel`. The provider goes in the plan workspace, above both the toolbar and
the panel, and the surface **registers its node into it** from below — which is the `ChromeSlot`
shape a second time (provider high, node registered from underneath), and the second reason to reuse
that pattern rather than invent one.

**Its exact home is `plan-workspace.tsx`**, not `plan-workspace-toolbar.tsx`. The toolbar file's
root `<div>` looks like the obvious place and is not: `useTsldToolbarContext` is called at
`plan-workspace-toolbar.tsx:282`, in `ToolbarPlanWorkspace`'s **own body**, and a provider rendered
in that component's JSX does not cover a hook called in the same component. `PlanWorkspace`
(`plan-workspace.tsx:23`) renders `<ToolbarPlanWorkspace>` and nothing else, so wrapping it there
covers the toolbar hook, the panel's two `useMemo`s and the canvas alike.

Worth being explicit about why the print path is not exempt: its own docblock promises that a
printed diagram "cannot drift from the one on screen", and it reads the same `--color-primary` /
`--color-destructive` / `--color-warning` names. The moment L4-1 re-values those inside the canvas
scope, a print resolved from the page paints the **old** bar colours — the export silently stops
matching the screen, which is the one thing that function exists to guarantee.

So the element is published as **state, not a ref** — the `useChromeSlot` pattern, and for the
identical reason recorded there: `createPortal`/`getComputedStyle` need a real element at the moment
they run, and a ref mutation re-renders nobody, so a consumer would resolve once against nothing and
never recover. A callback ref feeding `useState` re-renders the consumers exactly once, when the node
mounts, which is what makes `TsldPanel`'s two `useMemo`s correct rather than one-frame-stale forever.

**And the fallback is the part to get right, because a plausible one is indistinguishable from
success.** Today every resolver defaults to `document.documentElement`; keeping that default means a
consumer that never receives the element paints page colours and **nothing anywhere reports it** —
the failure `design.md` §1.2 names as E's one real risk, which is currently reachable by the most
natural edit anyone would make. The default goes, and a resolver called with no scope element throws
in development (the `Surface` nesting-guard precedent: fail loud in DEV, render anyway in
production — a mis-wired palette must never blank a planner's diagram).

**Task order, and the two that will be skipped if they are not written down:**

1. `SurfaceTone` += `'canvas'`; the `[data-surface='canvas']` block at **today's resolved values**,
   so arrival is byte-identical and the value work is a separate commit with its own diff.
2. The PLOT pack moves out of `OUTSIDE_THE_CLOSURE.packs` and becomes declared **by** the scope —
   `token-architecture.test.ts` already anticipates this in that constant's own comment.
3. The element context, the `useLayoutEffect` resolution, and the DEV guard, together in one commit:
   they are one mechanism and splitting them ships a window where the guard is absent.
4. `token-contrast.test.ts` gains `canvas` and its pairs, **reporting** at L1.
5. **`resolvePrintPalette` (`use-diagram-image.ts:103`)** — named separately because it is off the
   render path, so no screen shows it wrong; a miss here paints page colours into a delivered PDF.
6. **`resolveLensPalette` in `TsldPanel`'s two `useMemo`s** — the only consumers _above_ the canvas,
   so they are the ones the state-not-ref decision exists for, and the ones a ref-based version would
   leave permanently stale while looking correct.
7. Then the values (L4-1) and the Gantt (L4-2), each with the measurement `migration.md` requires.

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

**Re-verified against the file 2026-08-19, before F2 is scoped** — because Landing C's problem
statement had four symptoms of which two were already fixed, and chasing a fixed symptom changes a
correct file (CLAUDE.md §19.10). Half of this list is now closed, and the half that is open is worse
than it reads:

- ~~§268 _"There are five scopes"_~~ — **closed.** The paragraph was rewritten in Landing A, states
  five correctly for today, names `canvas` as the planned sixth and **dates itself**: _"this
  sentence becomes wrong the day it lands"_. Landing E updates it; F2 does not need to.
- ~~§272-277 `brand`/`auth` as theme-invariant across Light, Dark and Corporate~~ — **closed**, and
  replaced with the better reason measurement found: they survive because they are _designed_
  differently from the page, with the `auth` reversal and its two pinning gates written in.
- **§239 is the live one, and it contradicts §268 in the same file**: _"There are three scopes"_
  with a table of three, followed by _"a complete **17**-token family"_. Landing A corrected the
  §268 passage and left this one, so a reader now finds three scopes and 17 tokens on one screen and
  five scopes and 18 names a page later. That is worse than either being wrong alone — the original
  entry ("§230's three against §267's five") described a smaller version of it.
- **`text-3xl` is genuinely unused** — **zero** call sites in `apps/web/src`. Still open.
- **`DataTable` exists** (`components/ui/data-table.tsx`), so the entry is about the five features
  §460 claims for it, not about the component. Check the claims, not the existence.
- The 36-vs-40 control scale (§103) is still open.

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
6. **`globals.css` still grows**, though far less than before: **six** families at **31** names each
   (18 base + the thirteen the closure pulls in — counted from the shipped block, not derived from
   prose; see `closure-measurement.md` §3a), plus packs plus metric, type, elevation and motion —
   but **once**, not three times. **Both of those numbers moved after this line was written**: `auth`
   was measured and stays (§A), and the closure grew a family by 61 %. The net is still a reduction —
   186 declarations against 270 — but it is a little under two thirds, not the third that the
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

---

## F1's two blocking decisions, taken 2026-08-19

`migration.md` said neither was decided and that nothing converts until both are. One is decided
here; the other is deliberately **not**, and says what would decide it.

### 1. The discriminator: `Combobox` when the option set is server-paged, searchable or annotated

`combobox.tsx:12-15` already states its own reason for existing, narrowly: a native `<select>`
cannot do **type-ahead filtering against the server**, a **"load more" page**, or **options that
carry a tier/state annotation**. A four-option dependency type (FS/SS/FF/SF) has none of those
properties, and replacing a correct native control with a heavier hand-rolled one is a cost with no
purchase. So the rule is the narrow one, and it is the primitive's own.

**Measured before it was written, and the plan's implied scale is wrong by about 5×.** The counts
hold — **22 `<SelectField>` and 19 `<Select>` non-test call sites**, close to the "~20 plus ~15" the
plan estimated. What does not hold is that they are all candidates. Grouped by whether their options
come from a query at all:

| site                                         | selects | queries | verdict                                                                                                                                                                 |
| -------------------------------------------- | ------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AddCrossPlanLinkDialog`                     | 6       | 4       | **convert 4** — Client → Project → Plan → Activity, server-queried and cascading; the activity list is unbounded on a real plan                                         |
| `ResourceFormDialog`, `PlanCalendarPicker`   | 1 each  | 1–2     | already `Combobox` where it matters (ADR-0053 M4); re-check, do not assume                                                                                              |
| `ActivityBreakdownField`, `WbsBulkAssignBar` | 1 each  | 0       | **convert** — a plan's WBS summaries, and both already work around the native trap their own docblocks record                                                           |
| the other ~30                                | —       | 0       | **stay native**: Status, Type, Constraint, Secondary constraint, Duration type, Cost accrual, Earn value from, Role, and the table filters. Fixed enums of 2–6 members. |

So F1's select half is **about six conversions, not thirty-five**. That is a finding rather than a
scoping win: the plan's number came from counting call sites, and the discriminator's whole purpose
is that a call site is not a candidate.

### The rule was wrong on its first application, and the correction is the useful part

Applied to `AddCrossPlanLinkDialog` — the four sites the table above calls the strongest candidates
— **"server-paged" says none of them qualifies.** All four use `apiFetchAllPages`
(`lib/query/hierarchy-queries.ts:26`, `cross-plan-dependencies/api:37`), which walks every page
into one array before rendering. That is not server paging; it is the opposite, and a rule keyed on
it would have left a 2,000-option `<select>` in place while calling the decision made.

**The right test is whether the option set is unbounded by the DATA MODEL, not by the fetch.** An
eagerly-paged list of 2,000 activities needs search precisely because nothing bounds it; that it is
currently fetched in one go is a symptom to fix, not a justification for a native picker. So:

> **A `Combobox` when the option set is unbounded by the data model, searchable, or annotated. A
> native `Select` otherwise.** "Unbounded" means the domain sets no ceiling — a plan's activities, a
> library's resources. Bounded-in-practice is not unbounded: an organisation's clients, a client's
> projects and a project's plans are tens, and a native picker is the better control for tens.

Re-applied, the cross-plan dialog converts **one** of its four — **Activity** — and Client, Project
and Plan stay native. The set for the whole of F1 is therefore **three**: that one, plus
`ActivityBreakdownField` and `WbsBulkAssignBar` (a plan's WBS summaries), and those two wait on the
coarse-pointer question below because the activity editor is reachable on a tablet.

Recorded rather than quietly amended, because the first version of the rule was written from the
primitive's docblock and never applied to a call site before being called decided — which is the
ADR-0076 Class 3 shape, and this file's own §19.10 rule catching its author two commits later.

### The row-action half rests on a premise that does not hold as stated

F1's other half says **"~10 tables carrying bare per-row text actions where
`docs/UX_STANDARDS.md` 'Row / node actions' specifies the APG row menu"**. Read against the
standard, that is not established, and the check is the same one §19.10 asks for.

**The standard's subject is "dense list and tree rows"** (`UX_STANDARDS.md:86`) — the Project
Explorer and its kind. A data table with a dedicated actions column is a different pattern, and
`CalendarsTable.tsx:250-251` **already cites this standard and claims compliance in its own
comment**: _"Always-visible row actions (never hover-only, docs/UX_STANDARDS.md 'Row / node
actions')"_. The standard's own text supports that reading: its four routes include a
**hover-revealed** `⋯`, which exists to stop a dense row hiding its actions — a problem a visible
actions column does not have.

So there is no standards violation to fix, and converting ten tables on the strength of one would
have been a large interaction change justified by a misreading.

**What IS real is narrower and worth doing.** Counted rather than asserted, two tables carry
**seven** small buttons in their action column — `CalendarsTable` (View / Edit / Archive /
Unarchive / Move to organisation / Delete, role-dependent) and `ResourcesTable` — while the other
six carry two. Five text buttons on a row is not a standards defect; it is a row whose **primary**
action competes with four secondary ones for the reader's eye and for horizontal space.

**The treatment therefore is not "put the actions in a menu".** Burying `Edit` — the common case —
behind a click to tidy the rare ones trades the frequent interaction for the infrequent. The
defensible shape is the one the canvas selection bar already uses: **the primary action stays
visible, the secondary ones move behind a `⋯`**, with ADR-0082 reason wiring so a shaded item keeps
its explanation.

**That is a design decision across ~2 screens, not a mechanical conversion across ~10**, and it
should be built once as an exemplar and reviewed before it is rolled out — which is what the rest of
this document says about every other conversion and is the reason the count mattered.

### 2. What a hand-rolled combobox costs on a coarse pointer — NOT decided, and it gates the rest

A native `<select>` gets the platform's own picker: the iOS wheel, the Android sheet. That is the
single best mobile control in the product and it is free. A `Combobox` gets an in-flow listbox
competing with a virtual keyboard. `design.md` §3.3 already resolves `comfortable` density under
`@media (pointer: coarse)`, so this collides with a decision this epic has taken — and
`docs/TECH_DEBT.md` **#133** records that **no toolbar measurement in this repository has ever been
taken with a coarse pointer**, which is the same blind spot one surface along.

**This is not a judgement call to make from a desk.** It needs a coarse-pointer run and an
`accessibility-reviewer` / `ux-reviewer` read **before** the conversions, not after. Until then the
four cross-plan selects are the safe subset — they sit in a dialog a planner reaches from a desktop
workspace — and `ActivityBreakdownField` / `WbsBulkAssignBar` wait, because the activity editor is
reachable on a tablet.

Recorded as a blocking question rather than an assumption, because the failure mode is silent: a
converted picker looks correct on every desktop and is worse on the device nobody tested.
