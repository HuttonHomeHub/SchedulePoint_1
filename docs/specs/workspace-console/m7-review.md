# M7 — the gate pass

**Status:** Approved

Six specialists over the combined M0–M6 diff, as the plan names them. **M3's and M5's pre-release
reviews covered their own milestones; this pass saw the whole**, and that distinction earned its
keep: four of the five blocking findings below sit in the seam between milestones, where a thing
was correct when it landed and became wrong when a later milestone moved something else.

**Security passed** having re-derived rather than accepted: it confirmed the diff touches no API,
schema or auth code, that `resolveLockView` and the lock mutations are untouched, that the `only`
filter can only narrow a server-derived list, and that the deck's control has no path to override
or take-over at all. Its one finding was a false claim in our own spec, corrected in `ccf10afa` and
filed as `docs/TECH_DEBT.md` #286.

**Accessibility passed** with no blocking WCAG finding, having independently traced all five ladder
consumers, the single live region, and every focus path.

## Blocking, folded

### 1. The pen's focus ring was invisible on the pen's own fill

Reached by the ux review. `--chrome-ring` and `--chrome-primary` are the **identical string**, and
the shared toolbar focus treatment is `ring-inset` — so on the one state with an amber fill, the
focus indicator painted amber on amber. A 1:1 indicator, on the control this epic exists to put at
the head of the row. WCAG 2.2 §2.4.7, and §1.4.11 for the indicator.

This is CQ-2's collision arriving one state late. That question was answered for `armed` by
dropping its ring, which works because `armed` keeps the band's own fill and therefore never had a
ring-on-fill pair at all. M5 added a state that does, and nobody re-ran the check.

**The contrast matrix was structurally incapable of catching it**: it asserted `--background`
against `--ring` — the ring against the _surface_ — and had no pair for the ring against a
_control_. The pair was added first and watched fail, which is this file's own rule. The fix reuses
`--primary-foreground`, the ink that state already puts on that fill, so it needs no new token and
no scope's family grows.

### 2. The group seam was specified twice and built neither time

Reached independently by the ux and architecture reviews. `TOOLBAR_INSET_RULE`'s docblock stated as
fact that "the group-level seam joins it at M4"; M1-T3 specified its geometry. `inset-y-1/5`
appeared nowhere in the repository.

While the captions existed, their `border-r` was incidentally doing that job — so **M6 did not
create this defect, it removed the accident hiding it**. After M6 the deck's four groups were
separated by 8 px of nothing while the registry sections _inside_ them kept a painted rule and
16 px: the finer division twice as wide and the only one with ink, and the boundary that vanished
is the one carrying most meaning on the DO row, where Author's eleven pen-gated commands meet
Plan's, which are never gated.

Built, and gated as a **relationship** rather than two class strings: the coarser boundary must be
the taller mark, or the two stop reading as a hierarchy. Verified red twice — against the shipped
state with no group mark, and against a group mark equal in height to the section rule.

### 3. The pen's shaded reason answered a different question from the one asked

Reached by the ux review. `disabledReason` read `view.message`, and for a Viewer or Contributor
looking at an unlocked plan `resolveLockView` sets that to **"No one is editing this plan."** — so
the product shaded `Start editing` and gave, as the stated reason, a sentence meaning the opposite:
if nobody is editing, why can I not?

Every pen-gated command one item to the right already distinguishes the role from the lock through
`scheduleRefusal`, whose own docblock names the failure — _"A Viewer told to 'start editing' is
being pointed at a button their role will never give them"_. The pen reached for the status
sentence instead. **One correct pattern applied to a control and not its neighbour, in the one
control whose entire job is to explain this distinction.**

Fixed with the branch on which fact is refusing, and pinned in both directions: the role sentence
present where the role refuses, the lock's own sentence kept where the lock refuses. The second
half matters — without it the fix could be satisfied by saying "your role" in every shaded branch,
which is false for a Planner who simply does not hold the pen.

### 4. A once-a-second timer moved from a leaf to the root of the plan workspace

Reached independently by the performance and architecture reviews, and **measured** by the first: a
render-count probe against the pre-epic baseline showed `TsldPanel` — the canvas host, not itself
memoised — going 1 → 6 renders across five ticks where it had gone 1 → 2 and not scaled with the
tick at all.

`usePenLockView` returned a fresh object literal every render. That was harmless while it was
called in a leaf; M5 moved the call to the top of the workspace and threaded the result through the
TSLD toolbar context, so the tick began invalidating that context's memo every second — and with it
`resolveItems` over every registered command, both toolbars, and the canvas host. **The memo's own
docblock names this hazard in as many words** and M5 defeated it unconditionally.

Fixed by memoising the hook's return on the signature it already computes for its focus effect —
so identity and effect cannot disagree about what counts as a change — and by adding the
`document.hidden` guard `render/use-now.ts` has carried since ADR-0056 and this timer did not. A
backgrounded plan was re-rendering the workspace 3,600 times an hour to advance a phrase nobody was
looking at.

### 5. `primary` was reserved by a name list in one feature's test

Reached by the architecture review, and its argument is why this is a decision rather than a tidy-up.
The state is sound in a shared primitive; the _reservation_ as written was not. A name list cannot
see a control registered in a **third** registry, so a second amber slab could appear with nothing
red — while an author who did register in one of the two arrived at a list prose forbade them to
append to, with no good move left.

Split: the **primitive enforces the cardinality** (at most one `primary` per surface, thrown at
declaration in `defineToolbar`, alongside a guard that `primary` without `isActive` is a picture the
control can never take), and **the product keeps the identity** (`state-ladder.structural.test.ts`
still names the pen). The field's docblock now documents the third value, which it did not.

## Recorded rather than changed

### CQ-4's outlet stayed in `PlanFacts`, and that is deliberate

Three reviewers noticed the shipped shape differs from CQ-4's wording, which says `PenStatusOutlet`
**moves** to become a third sibling in `PlanActivitiesFootRow`. It did not move; it stayed nested
inside `PlanFacts`, which is portalled to the foot row.

**Moving it literally would have created a defect.** `PlanFactsOutlet` is gated on `hostsPlanSlots`
and is not rendered below `md`, where the activities row does not exist — while `PlanFacts` itself
is always mounted and falls back in place. So a literal move would have deleted the pen's badge,
sentence and hand-off controls on exactly the screens with least room to lose them, which is
ADR-0114 M7's recorded defect verbatim, one subject along. Following the outlet chain is what
established that, before any code was written.

The architecture review's residual concern is real and is stated rather than dismissed:
`[data-schedule-state]` is `shrink-0`, which ADR-0114 M1 and ADR-0115 both record as the shape that
clips controls, and **M0-T4's owed reading — the same measurement with an activity selected, at
1440 — was not taken.** M6's fixture is pen-held, which is the branch with no hand-off controls at
all, i.e. the narrow one. The foot measured a flat 51 px there. The worst case is unverified and
belongs in `docs/TECH_DEBT.md` rather than in a green tick.

## Non-blocking, filed

Documentation drift the reviews found across the epic: superseded docblocks left physically above
their replacements rather than edited in place; `Deck.tsx` describing two mechanisms this epic
deleted; a stale `aria-pressed` justification whose example M3-T4 removed; a `row` vocabulary
collision between the registry's band axis and the deck's line axis; `CompactPenStatus` having lost
its last production caller. These are M8's sweep.

## The pattern the pass is really about

**Three things in this epic were specified and not built**: the ladder's fifth state, the group
seam, and CQ-4's outlet. Only the first was caught before this pass, and only because the wrong
state _painted visibly wrong_. The other two looked right at rest.

That is the honest conclusion: shipped-versus-planned reconciliation happened where something was
visibly wrong, and nowhere else. ADR-0058's rule is _verify the claim_; what this epic shows is
that a plan is a claim too, and the ones that survive are the ones nothing renders.
