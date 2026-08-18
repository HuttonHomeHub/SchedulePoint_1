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

| Landing                                  | What it is                                                 | Visible?              | Rollback              |
| ---------------------------------------- | ---------------------------------------------------------- | --------------------- | --------------------- |
| **A — Foundations**                      | one theme, the closure, type + metric + the six archetypes | Almost nothing        | free (mostly no-op)   |
| **B — The landing page, fully realised** | **the first screen in the new language — the early look**  | **Yes, entirely**     | one screen            |
| **C — The command surface**              | measure, then the menubar                                  | Yes, the workspace    | revert a named commit |
| **D — The workspace shape**              | one band, the rail as sole navigator, the activity panel   | Yes, substantially    | revert a named range  |
| **E — The diagram**                      | the canvas scope, plot separations, the Gantt              | Yes, the primary view | revert a named range  |
| **F — The remaining screens, and docs**  | tables, editor, staff, public; documents re-derived        | Yes, incrementally    | free                  |

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
  the product has never actually shipped Inter.
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

| Why it, rather than any other screen                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **It is new.** No legacy DOM, no journey asserting its structure, no parity suite to preserve. Every other candidate — the clients list, the workspace — has all three.                            |
| **It is the screen the product owner opened this thread about**, and the one they will see first after sign-in.                                                                                    |
| **Its API half is genuinely independent.** Indexes have landed and the read model is next; nothing in this epic touches either.                                                                    |
| **It needs precisely the six archetypes.** Its own §0.3 lists five gaps and four of them are `EmptyState`, `Skeleton`, a section archetype with a real heading rank, and a list-row archetype.     |
| **It is the right size to be a proof.** Multiple sections, three empty states, a feed, a metrics strip, links into the hierarchy — large enough to be real, small enough to land in one milestone. |
| **It does not depend on the hard, slow work.** No canvas scope, no painter, no plot separation matrix, no toolbar arithmetic. It can be finished while all of that is still in flight.             |

### The condition, and it is not negotiable

**It must be built from the archetypes, not from a bespoke layout that happens to look right.** A
beautiful one-off on the flagship screen would falsify this epic's entire thesis on its first
outing — and it is exactly the failure mode `docs/specs/organisation-landing/` §0.3 was written to
avoid, one level up. If the screen needs something the vocabulary does not have, **that is a
requirement on A**, and A is one landing away rather than five.

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

**Measure first, and the falsification condition is written before the measurement**
(`command-surface.md` §6): render five labelled menu triggers and the eight-item strip into the
existing harness at 1646, 1440, 1280, 1024 and 768. **If the band does not fit at 1646 with ≥ 120 px
of slack, the proposal is withdrawn and the fourth-fitting option returns.**

Then, if it holds: the `menubar` primitive, the registry re-pointed (items unchanged — only the
renderer), the ladder's apparatus deleted, `e2e-toolbar-fit` re-pointed with S3 becoming "reachable
**by name**" rather than "reachable via an unnamed glyph".

Nine of thirty-three journeys touch the toolbar. All thirty-three are run.

---

## D — The workspace shape

The three moves that depend on C, in this order:

1. **The organisation nav leaves the header for the rail** (`screens.md` §0, §3). 637 px freed, one
   navigator, one `aria-current` treatment.
2. **The band merge**, gated on the arithmetic in `screens.md` §1.2 — ~1677 px against 1646, **31 px
   short**, with two measured cuts available. **If it does not fit, the two-band fallback ships**, which
   still returns 90 px and does not depend on the nav move at all. Named up front because ADR-0092 M5
   measured a merge, found it 134 px short, and withdrew it.
3. **The activity editor becomes a docked panel** (`screens.md` §2) — the largest behavioural change
   in the epic, gated on a `ux-reviewer` recommendation and a product-owner decision, and retiring
   `Dialog`'s `xl` preset with it.

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

## F — The remaining screens, and the documents

Tables, the Project Explorer's zones, the staff console, the public screens, the dialog set. Then
`docs/DESIGN_SYSTEM.md` **re-derived from the gates** — it is currently wrong about the type scale
(`text-3xl`, unused), the control scale, the table primitive, the scope count (§230 says three, §267
says five) and the family size (§246 says 17, the gate says 18). `CLAUDE.md` §16 and
`docs/adr/README.md` gain ADR-0097 **in the same commit as the ADR file**, because
`scripts/check-counts.mjs:55` re-derives the count from `docs/adr/`.

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
6. **`globals.css` still grows**, though far less than before: five families plus packs plus metric,
   type, elevation and motion — but **once**, not three times.
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
