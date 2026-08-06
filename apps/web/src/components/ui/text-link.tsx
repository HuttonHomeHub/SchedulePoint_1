import { cva, type VariantProps } from 'class-variance-authority';

/**
 * The inline text link (ADR-0077 M2-T2, closing `docs/TECH_DEBT.md` #97(b)).
 *
 * `text-primary font-medium underline-offset-4 hover:underline` was copied by hand into five public
 * screens, and M4 was about to add a sixth. The debt row asked for a `Link` variant in
 * `components/ui/` rather than another copy.
 *
 * **It is a `className` factory, not a component**, for the same reason `buttonVariants` is: these
 * links are TanStack Router `<Link>`s, and wrapping one loses the type-safe inference on `to`,
 * `params` and `search` that catches a link to a route that does not exist. A `className` export
 * composes with the router's own element instead of hiding it, and it works just as well on a plain
 * `<a>` for the rare external target.
 *
 * It adds one thing the copies did not have: a **visible focus ring**, taken from `buttonVariants`
 * so the two controls a public screen offers do not indicate focus in two different ways.
 */
export const textLinkVariants = cva(
  'text-primary font-medium underline-offset-4 hover:underline rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  {
    variants: {
      size: {
        /** Inherit the surrounding prose's size — the common case, inside a `<p>`. */
        inherit: '',
        /** Size it here, for a link that stands alone rather than inside a sentence. */
        sm: 'text-sm',
      },
    },
    defaultVariants: { size: 'inherit' },
  },
);

export type TextLinkVariants = VariantProps<typeof textLinkVariants>;
