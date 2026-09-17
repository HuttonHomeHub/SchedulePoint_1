# M7 — forced colours (`docs/TECH_DEBT.md` #324)

**Status:** Accepted

## The measurement that was owed, and its answer

D5 left "the `forced-colors` cascade-layer question" explicitly unmeasured, to be settled in a
browser before anything depended on it. Settled:

**Tailwind v4 emits its utilities inside `@layer utilities`.** So
`.focus-visible\:outline-none:focus-visible` is a **layered** (0,2,0) and a bare `:focus-visible` is
an **unlayered** (0,1,0) — and an unlayered declaration beats every layered one whatever its
specificity. That is the whole reason one rule can override 61 occurrences across 49 files without
touching a single call site.

It is a fact about the **build**, not about the source, so it was checked against the built
stylesheet rather than reasoned about: `dist/assets/index-*.css` puts the block at an **empty layer
stack**, verified by a brace-depth walk of the emitted file rather than by reading for `@layer`.

Two earlier readings of mine were wrong and are recorded rather than quietly dropped:

- I first reported the utilities as **unlayered**, from a grep that required a `;`. They are not.
- A first probe reported the control firing in both modes — I had written Tailwind **v3**'s
  `outline-none` (`outline: 2px solid transparent`), where v4's is `outline-style: none`. Fixed by
  probing the real built CSS instead of a remembered value.

## What shipped

```css
@media (forced-colors: active) {
  :focus-visible {
    outline: 2px solid Highlight;
    outline-offset: 2px;
  }
}
```

Appended **after** the closing brace of `@layer base`, which is the only place it works.
`Highlight` is the forced-colors system colour for a focus or selection indicator, so the ring
matches the reader's chosen high-contrast theme rather than one we picked — and one we picked would
be overridden by the mode anyway. The 2px offset matches the `ring-offset-2` the ordinary path uses,
so switching the mode on does not change the shape.

## Two gates, covering different halves

**`apps/web/src/styles/focus-ring.structural.test.ts`** — three assertions, one of them the pinned
positive case (ADR-0093): the rule exists, sits outside every `@layer`, and uses `outline` rather
than `box-shadow`. **Verified red against the tidy-up it guards**: moving the block into
`@layer base`, which is where every other global rule in that file lives and is what a later reader
would naturally do, reports `expected [ 'base' ] to deeply equal []`. It reads the SOURCE, so it
proves intent and not output, and says so.

**`apps/web/e2e-forced-colors/`** — the half that runs a real browser against the real bundle.
Production build, `vite preview`, **no API server** (every control it needs is on the public
`/sign-in`), three different primitives, and the assertion that matters is a **pixel comparison**:
a screenshot of the control's box before and after `Tab`. A test that only read `outline-style`
would pass against a ring nobody can see.

**Verified red**: with the block removed, all three forced-colours cases fail on
`focusing this control changed no pixels under forced colours` while the `forced-colors: none`
control passes — which is also what makes the control discriminating, since a run proving only "the
ring appears under forced colours" would pass equally against a build that had replaced the shipped
box-shadow ring everywhere.

Its own limits are in its docblock: Chromium's `forcedColors` is an **emulation** of Windows High
Contrast, not the mode on real Windows, and nothing here is observed with a screen reader —
`docs/TECH_DEBT.md` #154 is untouched.

## The component review corrected the reasoning, not the choice

**The claim "put this inside `@layer base` and it loses to `outline-none` on every control" was an
overclaim, and its counter-example is eight lines above it in the same file.** An `!important`
declaration inside `@layer base` also wins — `!important` is resolved before layer order is
consulted, so it beats a non-important declaration in a later layer — and the `prefers-reduced-motion`
block is exactly that mechanism, deliberately overriding whatever utility a component applied. The
reviewer verified it in a real headless Chromium rather than asserting it. ADR-0076 Class 3, one
paragraph from a working counter-example in its own file, corrected in place.

**Unlayered is still the choice, for the reason the overclaim was standing in for: it stays
extensible.** This record's own trigger to revisit is a control whose ring must differ in shape or
position. Overriding a non-important unlayered rule needs only `!important` in any layer, or more
specificity unlayered; overriding an `!important` in the FIRST-declared layer needs an earlier layer,
which does not exist, or an edit to the rule itself. A rule that has to be edited to be extended is
the worse of two that behave identically today. A new named layer declared last was checked and is
worse than both: its precedence depends on staying the last layer mentioned anywhere in the bundle.

Three smaller findings were folded with it, none blocking: `ChildCounts`' JSDoc illustrated its
phrasing with **the exact two-level count FC-9 had withdrawn in the same commit**, so a reader
grepping for it would find nothing; its `text-muted-foreground` is redundant against `PageHeader`'s
wrapper today and is kept with the reason written down, because a primitive that depends on an
ambient parent class loses its tone silently when that wrapper is refactored; and an empty-array case
joins its suite. The review also found `page-archetypes.test.tsx` saying "The six page archetypes"
over a barrel exporting nine — pre-existing, and now a named set rather than a count, since nothing
checks a number in a docblock one import from the file that holds the maintained one.

## The accessibility review found a blocking gap, and the fix for it could not fire

**Nothing asserted that `forced-colors: none` leaves the outline unpainted**, and that is the failure
mode with the widest blast radius in the whole milestone. If the `@media (forced-colors: active)`
guard were ever defeated — a build change, a tidy-up, a bundler hoisting the rule out of its query —
the unlayered `outline: 2px solid Highlight` would fire **unconditionally, on every focused control
in the product, in ordinary colours**. `Highlight` is a valid CSS colour outside the mode too, so
that is not an inert mistake but a visible, permanent colour regression.

**Every other assertion in the suite would have passed.** `focusChangesPixels` returns `true` either
way (an added outline only adds pixel change); `box-shadow` is an independent property an outline
does not touch; and the structural test reads the source, so it cannot see a build-time defeat at
all. It is this epic's **own named risk** — the implementation plan says "the `forced-colors` block
is defeated by the cascade and ships inert" — asserted in three docblocks and tested nowhere.

**Then the fix for it passed against the defect, and that is the transferable part.** Written where
the review suggested, immediately after `toBeVisible()`, it read `outlineStyle` on an **unfocused**
control: `:focus-visible` does not match one, and `focusChangesPixels` blurs the element first, so
the read landed at the one moment the rule could not apply whatever the stylesheet said. Caught only
by running the mutation rather than trusting the assertion. It now reads while the control is
focused and **throws** if it is not. Verified red against the deleted guard; green with it.

Two further findings were folded as named gaps rather than fixed, because neither is a regression:
**ancestor clipping** is not exercised (a 2px outline at 2px offset extends 4px beyond the border
box, and an `overflow: hidden` ancestor clips it exactly as it clips a box-shadow ring — the
geometry is identical to the shipped `ring-2 ring-offset-2`, so wherever one is clipped today the
other is too), and **twelve `tabIndex={-1}` focus-handoff destinations carry a bare `outline-none`
and no ring at all**, so under this rule they gain one in forced colours and stay ringless in
ordinary colours. That mode inconsistency is a pre-existing WCAG 2.4.7 gap partly closed, not new
breakage, and is written into the journey's docblock so a later reader does not mistake it.

The review's other answers are recorded because they were checked rather than assumed: no roving or
managed-focus primitive gets a wrong or doubled ring (`Toolbar`, `Deck`, `Menu`, `Combobox` and the
TSLD's parallel listbox were each traced); `forced-color-adjust` appears nowhere in `apps/web/src`,
so there is no competing mechanism; and the skip link and the panel resizer — two controls whose
focus indicator is nearly their only affordance — are both better off.

## D5's second half is WITHDRAWN, on the measurement

D5 said "both, in that order" — the global block, then migrating the shared primitives' CVA bases
with a census. The migration is not built, and the reason is what the block turned out to be rather
than a shortage of time.

The block is **universal and gated**. `:focus-visible` matches every focusable element in the
product, in a mode where `box-shadow` computes to `none`, so after it there is no control whose
correctness the CVA migration would improve. What the migration would buy is that each primitive is
"right in itself"; what it would cost is **61 edits across 49 files, in 49 chances to get one
wrong**, producing no difference in rendered output in either mode — and every one of those edits is
to a shared primitive's public contract, which is ADR-0105's trigger.

A census was considered for the same reason and is not built either: what it would guard against is
the convention spreading, and the convention spreading is now harmless.

**Trigger to revisit:** a control that needs a focus indicator the universal rule cannot give it —
one whose ring must differ in shape or position, not merely in colour.
