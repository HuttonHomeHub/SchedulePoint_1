import { cn } from '@/lib/utils';

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export interface CardProps extends DivProps {
  /**
   * The element to render. Defaults to `div`. `SectionCard` passes `section` so that, paired with
   * an `aria-labelledby`, each titled section becomes a named `region` a screen-reader user can
   * jump to — a card on its own is not a landmark and must not become one by default.
   */
  as?: React.ElementType;
}

/** Surface container. Composes with the header/title/content/footer parts. */
export function Card({
  className,
  as: Component = 'div',
  ...props
}: CardProps): React.ReactElement {
  return (
    <Component
      className={cn(
        'border-border bg-card text-card-foreground rounded-lg border shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: DivProps): React.ReactElement {
  return <div className={cn('flex flex-col gap-1.5 p-6', className)} {...props} />;
}

/**
 * `wrap-anywhere` on the title and the description is **the fix for a measured reflow failure**,
 * not a precaution (ADR-0077 M6-T1).
 *
 * A card heading or description routinely carries a string somebody else chose — an organisation
 * name, an email address — and an email address is a single unbreakable token. At the WCAG 1.4.10
 * floor of 320px the invitation screen measured `documentElement.scrollWidth` at **327**, because
 * `You're signed in as first.last@a-long-company-domain.example` has nowhere to break.
 *
 * **`wrap-anywhere` and not `break-words`, and the difference is the whole fix.** The first attempt
 * used `break-words` (`overflow-wrap: break-word`) and the measurement did not move a pixel — still
 * 327. Both values break a long word rather than let it spill, but CSS Text 3 says the soft-wrap
 * opportunities `break-word` introduces are **excluded from min-content intrinsic sizing**, and it
 * is precisely the min-content contribution that sets a grid column's width. `anywhere` includes
 * them. So `break-word` fixes the *visual* overflow of a word inside a fixed-width box and does
 * nothing at all when the word is what decided the box's width — which is this case, and is
 * invisible to anyone reasoning about it from the class name.
 *
 * Either value is inert until a word would otherwise overflow its line, so this changes nothing on
 * a card that was already fine — which is why it belongs on the primitive rather than on the two
 * screens that happened to be measured.
 */
export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  /**
   * The heading rank this title takes. **Defaults to 1**, which is not the obvious choice and is
   * the one that matters.
   *
   * ADR-0097's plan proposed defaulting to 2, so a section card would not claim the page heading.
   * The component review measured what that costs: `CardTitle` rendered `<h1>` and **eleven** call
   * sites depended on it — `auth-shell.tsx` (sign-in, sign-up, password reset: the front door) and
   * every branch of `AcceptInvitationCard`. Defaulting to 2 turns all of them into an `<h2>` on a
   * page with **no `<h1>` at all**: a WCAG 1.3.1 / 2.4.6 regression on the screens where a stranger
   * meets the product, which nothing would fail to compile over.
   *
   * So the default stays 1 and `SectionCard` passes `level={2}` explicitly — a section heading is
   * an `<h2>` because the archetype says so, not because every consumer remembered. Pinned by
   * `card.test.tsx`.
   */
  level?: 1 | 2 | 3;
}

export function CardTitle({ className, level = 1, ...props }: CardTitleProps): React.ReactElement {
  const Heading = `h${level}` as const;
  return (
    // eslint-disable-next-line jsx-a11y/heading-has-content -- content is supplied by consumers via children
    <Heading
      className={cn('text-xl leading-tight font-semibold tracking-tight wrap-anywhere', className)}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>): React.ReactElement {
  return <p className={cn('text-muted-foreground text-sm wrap-anywhere', className)} {...props} />;
}

export function CardContent({ className, ...props }: DivProps): React.ReactElement {
  return <div className={cn('p-6 pt-0', className)} {...props} />;
}

export function CardFooter({ className, ...props }: DivProps): React.ReactElement {
  return <div className={cn('flex items-center p-6 pt-0', className)} {...props} />;
}
