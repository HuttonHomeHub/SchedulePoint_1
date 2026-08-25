import { cva } from 'class-variance-authority';

/**
 * The **one** control-surface style for every {@link Toolbar} and {@link Deck} control (ADR-0031):
 * the plain {@link ToolbarButton}, the {@link ToolbarPopover} trigger, the deck's group captions,
 * and the pinned Project-finish chip.
 *
 * This line named `ToolbarOverflow`'s `⋯` trigger until the 2026-08-25 reconciliation pass —
 * ADR-0109 D1 deleted that component with the width ladder, so the `{@link}` pointed at nothing. Declared once as a CVA so a change to the toolbar's
 * hover/focus/active/disabled treatment happens in a single place — never hand-copied per control
 * (design-system "variants declared once; no one-off styling"; component review).
 *
 * - `tone: 'control'` — the interactive default (buttons, popover/overflow triggers): medium weight,
 *   foreground text, hover wash when idle.
 * - `tone: 'info'` — a non-interactive read-out chip (Project-finish): muted, no hover.
 * - `active` — pressed/open (`aria-pressed` / an open disclosure): the accent wash.
 * - `disabled` — dimmed + inert cursor (the control stays focusable via `aria-disabled`, so this is
 *   presentation only).
 */
/**
 * The **split-button caret** treatment: a hairline divider before the caret, so a control that
 * both acts and opens a menu *reads* as two halves.
 *
 * Originally the **look only** (ADR-0055 §3 / spec §4.7 D11): a true split button is two focusable
 * halves, which inside a toolbar risks two roving-tabindex stops in one item — the a11y gate
 * ADR-0031 closed.
 *
 * **That is no longer what its consumers do.** ADR-0064 made the Add and Link controls real split
 * buttons: two `<button>`s, the primary carrying the roving `itemProps` and the caret held out of
 * the sequence with `tabIndex={-1}` and reached by `ArrowDown`. The pair is still exactly **one**
 * roving stop — `Toolbar.test.tsx` and `tsld-toolbar-authoring.test.tsx` both assert that — so the
 * gate stayed closed; what changed is that the affordance is now operable rather than decorative.
 *
 * Two rules for the next consumer, both learnt the hard way. `restoreFocusRef` must point at the
 * **primary**, never the caret: the caret is outside the tab order, so restoring focus there strands
 * a keyboard user (WCAG 2.4.3 — shipped, and caught by the ADR-0064 enablement review). And a
 * consumer composes {@link ToolbarSplitButton} rather than rebuilding the pair.
 *
 * **That second sentence used to say the opposite** — "a third should extract it rather than copy
 * it" — and by the time a design pass read it the extraction had already happened, in the very
 * component whose docblock names the merge it was written for. A stale instruction is worse than no
 * instruction: it tells the next author to do work that is done, in a file they will then edit.
 */
/**
 * The **24 px pointer-target floor** for a split button's caret (WCAG 2.2 §2.5.8 Target Size
 * (Minimum), AA). One constant rather than a literal at each caret, because there are **three** of
 * them and the third is how this was found.
 *
 * **Measured, not reasoned** (ADR-0090 M3): the two shared carets rendered **23 × 36** and
 * `IsolateControl`'s bespoke one **22 × 36** — a `size-3.5` chevron (14 px) inside `px-1` (8 px),
 * plus this variant's 1 px divider. The M3 plan disputed ≈22 vs 24 px and called for the real box to
 * be captured before deciding; `e2e-toolbar-fit`'s S7 sweep captured it, and both were failing.
 *
 * **None of §2.5.8's exceptions apply, which is why this is a fix rather than a waiver.** *Spacing*
 * fails because a 24 px circle centred on the caret intersects the primary it sits flush against.
 * *Equivalent* fails because the only other route to the menu is `ArrowDown`/`ArrowUp` on the
 * primary — a keyboard affordance, and 2.5.8 is about pointer targets. *Inline* and *Essential* are
 * not in play.
 *
 * `justify-center` goes with it: the floor adds width the icon would otherwise sit left of.
 */
export const TOOLBAR_CARET_TARGET = 'min-w-6 justify-center pointer-coarse:px-2';

export const toolbarSplitCaretVariants = cva(
  `border-border ml-0.5 flex items-center self-stretch border-l pl-1.5 opacity-70 ${TOOLBAR_CARET_TARGET}`,
);

/**
 * **Touch** (ADR-0090 M3-T4). Under `@media (pointer: coarse)` the control keeps its `min-h-9` and
 * widens to `px-3`, taking an icon-only button from **32 × 36 to 40 × 36**.
 *
 * *Toward* the house ≥ 44 px rule (`docs/UX_STANDARDS.md`), which today's 32 × 36 already fails on
 * **both** axes — and this closes one of them. **The 36 px minor axis is not claimed closed**: it is
 * `min-h-9` on a control whose row height the whole epic is trying to reduce, and raising it is a
 * vertical-space decision that belongs with M4's header merge, not a padding tweak. Recorded as
 * `docs/TECH_DEBT.md` #127.
 *
 * **The shared CVA is not densified in the other direction** (feature-spec §6 Q4): a global re-value
 * would degrade every touch user to satisfy a desktop complaint, and would buy ≈ 96 px against a
 * measured 94 px overshoot — appearing to fix the defect while leaving the miscount intact. If a
 * compact scale is ever wanted it is a `density` variant under `@media (pointer: fine)` only.
 *
 * The consolidated item count is what makes this affordable at all: 46 registered commands could not
 * have absorbed 8 px each, and 28 can. That is a real benefit of M2 rather than a claim about it.
 */
export const toolbarControlVariants = cva(
  'focus-visible:ring-ring pointer-coarse:px-3 inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-sm whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-inset',
  {
    variants: {
      tone: {
        control: 'text-foreground font-medium',
        info: 'text-muted-foreground',
      },
      active: { true: 'bg-accent text-accent-foreground', false: '' },
      disabled: { true: 'cursor-default opacity-50', false: '' },
    },
    compoundVariants: [
      // Idle interactive control gets the hover wash; an active or disabled one does not.
      { tone: 'control', active: false, disabled: false, class: 'hover:bg-accent/60' },
    ],
    defaultVariants: { tone: 'control', active: false, disabled: false },
  },
);
