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
 * It is the **look only**, deliberately (ADR-0055 §3 / spec §4.7 D11). A true split button is two
 * focusable halves, which inside a toolbar means two roving-tabindex stops in one item — that
 * re-opens the a11y gate ADR-0031 closed, and would need its own composite-stop design. Until
 * that lands, the Add control stays one stop that opens a menu; this variant only gives it the
 * affordance a planner recognises. `Toolbar.test.tsx` asserts the single stop.
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
