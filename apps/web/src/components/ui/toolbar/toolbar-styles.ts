import { cva } from 'class-variance-authority';

/**
 * The **one** control-surface style for every {@link Toolbar} control (ADR-0031): the plain
 * {@link ToolbarButton}, the {@link ToolbarPopover} trigger, the {@link ToolbarOverflow} `⋯` trigger,
 * and the pinned Project-finish chip. Declared once as a CVA so a change to the toolbar's
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
 * a keyboard user (WCAG 2.4.3 — shipped, and caught by the ADR-0064 enablement review). And the
 * composite is now duplicated across two controls; a third should extract it rather than copy it
 * (`docs/TECH_DEBT.md` #76).
 */
export const toolbarSplitCaretVariants = cva(
  'border-border ml-0.5 flex items-center self-stretch border-l pl-1.5 opacity-70',
);

export const toolbarControlVariants = cva(
  'focus-visible:ring-ring inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-sm whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-inset',
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
