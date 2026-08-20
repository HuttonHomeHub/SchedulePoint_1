import { Link, useRouterState } from '@tanstack/react-router';

import { cn } from '@/lib/utils';

/**
 * The product's **brand mark**: a rounded-square tile carrying the initial, beside the
 * "SchedulePoint" wordmark.
 *
 * The tile is `bg-primary text-primary-foreground` — deliberately a token, never a literal.
 * Inside the chrome scope that resolves to Corporate's amber on navy and to the brand blue on
 * Light/Dark chrome; a hard-coded amber would fail contrast the moment the header is white, and
 * would be exactly the one-off styling the design system forbids.
 *
 * Layout tier rather than a `ui/` primitive: it carries product copy, so it is not reusable
 * outside this product (`COMPONENT_LIBRARY.md` tier rules).
 *
 * `variant="tile"` drops the wordmark for the collapsed rail, where there are 46 px and the
 * wordmark cannot fit. It is a **variant, not an `iconOnly` boolean** — the next state this needs
 * is a third presentation, not the negation of a second, and a boolean cannot express that
 * (`COMPONENT_LIBRARY.md`, "boolean-prop sprawl"). The tile stays `aria-hidden` in both: the mark
 * never carries the accessible name, which belongs to whatever links it (`app-header.tsx`'s
 * `BrandLink` sets it, and `brand-panel.tsx` deliberately renders no link at all).
 */
export function BrandMark({
  className,
  variant = 'lockup',
}: {
  className?: string;
  variant?: 'lockup' | 'tile';
}): React.ReactElement {
  return (
    <span className={cn('flex shrink-0 items-center gap-2', className)}>
      <span
        aria-hidden="true"
        className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md text-sm font-bold"
      >
        S
      </span>
      {variant === 'lockup' ? (
        <span className="font-semibold tracking-tight">SchedulePoint</span>
      ) : null}
    </span>
  );
}

/**
 * The wordmark's link treatment.
 *
 * `chrome`-scope rebound names only — no colour literals, which the ADR-0055 lint rule enforces
 * and which would be invisible to the contrast matrix. `rounded-md` plus the focus ring rather
 * than an underline: the wordmark is a lockup with an icon, and underlining half of it reads as
 * damage.
 */
const BRAND_LINK_CLASS =
  'focus-visible:ring-ring hover:opacity-90 rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none';

/**
 * The wordmark, as the route home (ADR-0098 M4).
 *
 * **A sibling of `BrandMark`, never inside it**, because `brand-panel.tsx` renders the
 * same mark on the public screens — sign-in, sign-up, reset — where there is no session and no
 * route home. A link inside the primitive would put one there, pointing at a route the visitor
 * cannot reach. There is a test asserting the public panel still renders no anchor.
 *
 * It lives beside the mark rather than in `app-header.tsx`, where it was until Graphite M3: the
 * rail now renders the brand too, and a rail importing from a header is a dependency pointing the
 * wrong way — and one every suite mocking the header had to learn about.
 *
 * Off an organisation route (`/account`, `/me/activity`, `/onboarding`, `/staff`) it goes to `/`,
 * which the home resolver turns into the caller's last-active organisation or onboarding — the
 * same answer, arrived at by the one route that knows it.
 *
 * The accessible name **contains the visible text** ("SchedulePoint — organisation overview"), so
 * WCAG 2.5.3 Label in Name holds: a speech-input user saying "SchedulePoint" still matches.
 */
export function BrandLink({
  orgSlug,
  variant = 'lockup',
}: {
  orgSlug: string | undefined;
  variant?: 'lockup' | 'tile';
}): React.ReactElement {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isLanding = orgSlug !== undefined && pathname === `/orgs/${orgSlug}`;

  if (orgSlug === undefined) {
    return (
      <Link to="/" aria-label="SchedulePoint — home" className={BRAND_LINK_CLASS}>
        <BrandMark variant={variant} />
      </Link>
    );
  }

  return (
    <Link
      to="/orgs/$orgSlug"
      params={{ orgSlug }}
      aria-label="SchedulePoint — organisation overview"
      // **`activeOptions={{ exact: true }}`, and without it TWO links claim to be the current
      // page.** TanStack's `Link` sets `aria-current="page"` itself whenever it considers itself
      // active, and its default match is a PREFIX — so `/orgs/:slug` is active on `/orgs/:slug/
      // clients`, `/calendars`, every org route there is. The rail's real current destination is
      // marked at the same time, and a reader asking their screen reader "where am I" got two
      // answers.
      //
      // It was live from the moment the wordmark became a link (ADR-0098 M4) and invisible until
      // Graphite M3 put the brand and the destinations in the same container: `e2e-designed-ui`'s
      // D3 scoped its locator to `header`, so it only ever saw one of the two. The explicit
      // `aria-current` below was written to make the landing state deliberate and could not undo
      // the router's — a prop cannot remove an attribute a library adds.
      activeOptions={{ exact: true }}
      aria-current={isLanding ? 'page' : undefined}
      className={BRAND_LINK_CLASS}
    >
      <BrandMark variant={variant} />
    </Link>
  );
}
