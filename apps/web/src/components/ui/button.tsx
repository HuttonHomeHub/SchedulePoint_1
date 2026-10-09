import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef } from 'react';

import { cn } from '@/lib/utils';

/**
 * **Two shaded states, deliberately different.** A natively `disabled` control stays at 50 % and
 * `pointer-events-none`: it is out of the tab order and carries no reachable reason, so it is meant
 * to be the fainter of the two. An `aria-disabled` control stays in the tab order and usually has a
 * label and a reason a reader is meant to read, so it dims to 60 % and its hover is withheld
 * (`not-aria-disabled:hover:…`, which compiles to `:not([aria-disabled="true"]):hover` — a caller's
 * own `bg-*` still wins through `cn`, because nothing here restates a fill).
 *
 * **`pointer-events-none` is NOT here, and that is the caller's decision.** Whether a shaded button
 * should swallow the pointer depends on the expression bound to `aria-disabled`: while a request is
 * in flight it should, and at rest it must not, because `pointer-events: none` hands the click to
 * whatever is behind the control and makes its reason unreachable by hover (`docs/TECH_DEBT.md` #458,
 * #460). `submit-guard.structural.test.ts` reads each site's expression to hold that line.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-disabled:opacity-60',
  {
    variants: {
      variant: {
        // `hover:bg-primary-hover` / `hover:bg-secondary-hover`, never the `/90` and `/80`
        // alpha forms these used to carry — the rule the `destructive` comment below states, now
        // applied to its neighbours rather than to one of the three. The alpha census caught
        // `hover:bg-secondary-hover` at **3.8:1** for its own label on both navy scopes.
        default: 'bg-primary text-primary-foreground not-aria-disabled:hover:bg-primary-hover',
        secondary:
          'bg-secondary text-secondary-foreground not-aria-disabled:hover:bg-secondary-hover',
        // `text-foreground` is not decoration: a variant that states its own fill and then
        // inherits its ink is a bug wherever it lands (ADR-0055 §2, defect D3) — on a dark
        // surface it inherited light ink onto a light fill and vanished.
        outline:
          'border border-input bg-background text-foreground not-aria-disabled:hover:bg-accent not-aria-disabled:hover:text-accent-foreground',
        ghost: 'not-aria-disabled:hover:bg-accent not-aria-disabled:hover:text-accent-foreground',
        // `hover:bg-destructive-hover`, never `hover:bg-destructive/90`. The alpha form
        // composites the fill against the PAGE, so on a light surface it lightened toward white
        // and took the label to 4.32:1 — below 1.4.3, on every Delete button in the product. It
        // was invisible to both gates: the contrast matrix resolves tokens and a utility is not
        // one, and the axe suite measures no hover state at all. A token is checkable; an alpha
        // utility is not, and that is the reason for the shape rather than the colour.
        destructive:
          'bg-destructive text-destructive-foreground not-aria-disabled:hover:bg-destructive-hover',
      },
      size: {
        default: 'h-(--control-h) px-4 py-2',
        sm: 'h-(--control-h-sm) px-3',
        lg: 'h-11 px-6',
        // 40px on a fine pointer, 44 on a coarse one. The `pointer-coarse` half is ADR-0118 D2:
        // the house rule is the input device's, not the screen's, and `--control-h` is the ONE
        // place that axis is declared. Written as a coarse override rather than by replacing the
        // literal, because `size-(--control-h)` alone would take a mouse user's icon button from
        // 40 px DOWN to 36 — a regression bought while closing a touch gap.
        icon: 'size-10 pointer-coarse:size-(--control-h)',
        // (`icon-lg`, `size-11`, was here and is **deleted** — ADR-0118 M3.) It existed because
        // `docs/UX_STANDARDS.md` set an unconditional 44 px floor for a new panel close/toggle;
        // ADR-0118 D2 narrowed that floor to `pointer: coarse`, which `icon` above now meets, so
        // the variant's whole reason had lapsed and its one consumer — the minimap's close — was
        // the odd size out in a family of three. A variant kept for a rule that no longer exists
        // is the drift class this register tracks, in the design system rather than in prose.
        // Row icon button for a target in a row that GROWS with it. 28 px on a fine pointer, 44 on
        // a coarse one (ADR-0118 D2), written as a coarse override for the reason `icon` gives
        // above. The row has to be able to take the extra 16 px: the rows of the six
        // `RowActionsMenu` tables and the activities table are content-sized, so the button sets
        // the row and nothing overflows (`docs/TECH_DEBT.md` #215, `docs/specs/dense-row-touch-targets/`).
        //
        // A target in a row that grows with it is `icon-row`; a target in a fixed container is
        // `icon-sm` and is on ADR-0118 D1's list.
        'icon-row': 'size-7 pointer-coarse:size-(--control-h)',
        // Icon button for a target in a container whose height is fixed independently of it. **Stays
        // 28 px on BOTH pointers, and that is ADR-0118 D1's second named exception rather than an
        // oversight** — see D6a.
        //
        // A target in a row that grows with it is `icon-row`; a target in a fixed container is
        // `icon-sm` and is on ADR-0118 D1's list.
        //
        // M3 gave it `pointer-coarse:size-(--control-h)` and had to take it back: a 44 px button
        // centred in `HierarchyTree`'s 28 px row (`ROW_HEIGHT`, a JavaScript constant feeding both
        // the absolute row style and the virtualizer's `estimateSize`) overflows 8 px into the row
        // above and 8 px below, on rows packed edge to edge. The gate of the day asked whether a
        // control's CENTRE hits itself, and a control overflowing its container passes that.
        //
        // The only consumer meant to stay is `GanttRowMenu` (its rows are `GANTT_ROW_HEIGHT`, 28,
        // and the product owner's device recorded 0 misses in 10 — ADR-0177 D4). The Explorer tree
        // (`HierarchyTree`) and the collapsed spine (`explorer-column`) still pass it until their
        // rows and widths follow the pointer (`docs/specs/dense-row-touch-targets/`, M2 and M3);
        // `control-height.structural.test.ts` lists the call sites, so a new one is a decision.
        // The tables moved to `icon-row`: a row that is content-sized grows with its button.
        'icon-sm': 'size-7',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

/** The primary interactive control. Variants/sizes via CVA; tokens only. Forwards its ref
 * so callers can focus it (e.g. returning focus after a popover closes). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, type, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
});

export { buttonVariants };
