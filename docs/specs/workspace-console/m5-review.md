# M5 — the §19.13 review pass, and what it found

**Status:** Approved

The pen's verb moved into the command deck, so M5 changed a shared primitive's roving set and moved
focus-return responsibility between two surfaces. CLAUDE.md §19.13 requires **accessibility-reviewer
and component-reviewer before the change ships**, not at the next epic's gate pass. Both were run
against the finished M5 tree. **Both blocked.**

Six findings, and the shape of five of them is one this register keeps recording: a correct pattern
applied to a control and not its neighbour, invisible to every gate because the gates read a
declaration the control had not made.

## Blocking

### 1. The pen painted identically to an armed tool — and the fifth state was specified and never built

Reached independently by both reviewers.

`PlanPenControl` hard-coded `activeKind: 'armed'` in its JSX. `armed` is amber **ink** and an amber
underline on the band's own navy, which is what the four modal tools take — so a **held pen** and an
**armed Add tool**, sitting next to each other in the same `tools` group, rendered as one picture.
That is the exact confusion the M3 ladder exists to remove, reintroduced one level down and in the
opposite direction: the ladder's own docblock records rejecting an amber-FILLED armed state because
it collided with the pen's fill, and M5 collided them again by unfilling the pen.

**The state it should have used was specified and never built.** `implementation-plan.md` M3-T2 says
in as many words that `toolbarControlVariants`' `state` becomes
`'rest' | 'open' | 'selected' | 'armed' | 'primary'`, and `feature-spec.md`'s ladder table reserves
`primary` — a `--primary` fill at 7.91:1, no rule — for _"the pen, and only the pen"_. **M3 shipped
four states and nothing recorded the difference**, so M5 reached for the nearest of the four.

This is ADR-0090 M5's newest drift shape: a document describing work correctly and the work not
happening, which ADR-0058's rule cannot catch because there is no false claim to verify.

Fixed: `primary` added to the CVA and to all five type declarations, the pen declares
`isActive`/`activeKind: 'primary'` on the **registry**, and `PlanPenControl` reads `api.activeKind`.

### 2. The pen shaded itself beside eleven live commands, and said something false

Found by the accessibility review; no gate could have found it and the new unit table **pinned the
wrong behaviour as correct**.

`resolveLockView`'s `HELD_BY_ME` branch drops `stop` from the action list when a peer is asking,
offering `Hand over` / `Keep editing` instead. `isEnabled` read that list — so the pen went shaded,
labelled `Start editing`, described as _"Jane is asking to edit this plan."_ Meanwhile `holdsPen`
(`state === 'HELD_BY_ME'`), `canEditSchedule` and `authoringEnabled` were **all true**, so every one
of the eleven authoring commands beside it stayed live. A keyboard reader tabbed from a dimmed
"Start editing" straight into an enabled "Add activity".

The array answers _which buttons does the foot row render_. It was never an answer to _do I hold the
pen_, and the two coincide in twelve of the thirteen branches, which is why it read as correct — and
why a suite built by asserting agreement with `resolveLockView`'s own output could not see it. It
agreed.

Fixed at the source: `penVerbs` derives "I hold the pen" from `view.tone === 'editing'`, true in
**both** `HELD_BY_ME` sub-branches. `resolveLockView` and `HANDOFF_ACTIONS` are untouched — a
one-surface correction.

### 3. The enabled rule was written twice

`PlanPenControl` re-derived `canStart`/`canStop`/`enabled` from the same `actions` array the
registry's `isEnabled` reads: two hand-written copies agreeing only because both were typed the same
afternoon. `tsld-toolbar-items.tsx` carries the same warning **verbatim on three sibling `render`
items**, from the last time a component review found it.

Fixed: `disabled`, `disabledReason`, `pressed` and `activeKind` all come from the resolved item.
`actions` became unused and the prop was removed, which is the clearest evidence the component now
has no opinion about the lock.

### 4. `aria-pressed` was present in one state and absent in the others

`pressed` was spread only when held, so the same element was exposed as a **toggle button** in one
state and a **plain button** in every other. Whether `aria-pressed` exists is a property of a
control being toggle-shaped, never of its current value. Fixed by `pressed={api.active}`.

### 5. The deck's pen stayed pressable while a mutation was in flight

Its seven foot-row siblings all set `disabled={isPending}`; the deck's control set `busy` alone, and
`ToolbarButton` does not block activation on `busy` — that prop is `aria-busy` and nothing else.
Fixed, and recorded as a decision rather than left as an accident.

### 6. Lint

Two `import/order` errors, which block `pnpm prepush`.

## Gates the findings exposed

Three, and each is more useful than the fix it enabled.

- **`state-ladder.structural.test.ts` watched finding 1 ship.** It enumerates registry declarations,
  and the pen declared none — so all three cases passed while a fifth control painted armed. Its own
  docblock names that failure ("nothing else in the codebase would report it") for the case where a
  declaration is _missing_, and could not report this one for the same reason. Widened with a
  `primary` roster and its pinned positive; verified red both ways (pen wired to `armed`; pen
  declaring nothing).
- **Nothing anywhere read a class.** The branch table checked the accessible name, the pressed state
  and the shading — none of which can tell an amber-filled pen from an amber-inked armed tool. A
  paint assertion now sits in both the branch table and the primitive's own ladder suite. The
  negative on bare `text-primary` is what discriminates: both class strings contain the word.
- **`only` shipped with no direct coverage** and the `LockAction` partition was prose. The
  `as const satisfies` beside it proves every listed member is real; it says nothing about a real
  action listed **nowhere**, which is the only miss that happens by accident and renders on no
  screen at all. Both now have gates.

## Not accepted

The accessibility review proposed `activeKind: 'selected'` for the held pen. That is the right shape
against the plan's armed paragraph, which is all it read; the **spec's** ladder table settles it as
`primary`, and the citation was checked before acting rather than taken. `selected` is a
`--secondary` fill, which would make the pen look like a chosen segment rather than the row's one
amber slab.

## Method note

The two reviews ran against the M5 tree and the component review's findings were folded while the
accessibility review was still reading. Its report therefore describes the pre-fix tree; every
finding was re-verified against the current code before being folded or declined, and findings 1 and
3 had already been fixed from the component review when it arrived. Nothing was accepted on the
strength of a citation alone.
