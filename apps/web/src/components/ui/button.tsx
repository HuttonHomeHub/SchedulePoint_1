import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef } from 'react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // `hover:bg-primary-hover` / `hover:bg-secondary-hover`, never the `/90` and `/80`
        // alpha forms these used to carry — the rule the `destructive` comment below states, now
        // applied to its neighbours rather than to one of the three. The alpha census caught
        // `hover:bg-secondary-hover` at **3.8:1** for its own label on both navy scopes.
        default: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary-hover',
        // `text-foreground` is not decoration: a variant that states its own fill and then
        // inherits its ink is a bug wherever it lands (ADR-0055 §2, defect D3) — on a dark
        // surface it inherited light ink onto a light fill and vanished.
        outline:
          'border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        // `hover:bg-destructive-hover`, never `hover:bg-destructive/90`. The alpha form
        // composites the fill against the PAGE, so on a light surface it lightened toward white
        // and took the label to 4.32:1 — below 1.4.3, on every Delete button in the product. It
        // was invisible to both gates: the contrast matrix resolves tokens and a utility is not
        // one, and the axe suite measures no hover state at all. A token is checkable; an alpha
        // utility is not, and that is the reason for the shape rather than the colour.
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive-hover',
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
        // Row-height icon button for dense lists. **Stays 28 px on BOTH pointers, and that is
        // ADR-0118 D1's second named exception rather than an oversight** — see D6a.
        //
        // M3 gave it `pointer-coarse:size-(--control-h)` and had to take it back. Six of its eight
        // consumers sit in a container whose height is fixed independently of it, and the sharpest
        // is `HierarchyTree.tsx`: `ROW_HEIGHT = 28` is a **JavaScript constant** feeding both the
        // absolute row style and the virtualizer's `estimateSize`, so a 44 px button centred in a
        // 28 px row overflows 8 px into the row above and 8 px below — on a list whose rows are
        // packed edge to edge, and whose trigger is `[@media(pointer:coarse)]:opacity-100`, i.e.
        // permanently visible on exactly the device that would see it. Two independent reviews
        // found it; the epic's own gate could not, because it asks whether a control's CENTRE hits
        // itself and a control overflowing its container passes that.
        //
        // The exception's equivalent is stated per consumer rather than claimed for the variant,
        // because the advice this docblock USED to carry — "pair with a larger non-pointer target
        // (long-press / keyboard)" — turned out to be honoured by exactly ONE of the eight
        // (`HierarchyTree`'s `startLongPress` on the whole row, plus Menu/Shift+F10 on the focused
        // treeitem). Deleting that advice while introducing the size that needed it was the actual
        // defect. Growing the dense rows themselves under a coarse pointer is a row-rhythm
        // decision, not a padding one — `docs/TECH_DEBT.md` #215.
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
