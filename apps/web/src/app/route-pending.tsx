import { useEffect, useRef } from 'react';

import { PageContainer, Skeleton } from '@/components/ui/page';

/**
 * What a reader sees while a route's chunk (or its `beforeLoad`) is still arriving — the router's
 * `defaultPendingComponent`.
 *
 * **When it appears is the library's decision, and this file deliberately does not restate it.**
 * The router waits `defaultPendingMs` = 1000 before showing a pending component at all, and once
 * shown keeps it `defaultPendingMinMs` = 500, so a navigation that resolves inside a second never
 * flashes it (`@tanstack/router-core` `router.d.ts:98-113`, defaults in `router.js`). Those are
 * exactly the wanted behaviour for a chunk fetch, so `router.tsx` sets neither option and
 * `route-pending.test.tsx` fails if somebody does: `defaultPendingMs: 0` reads as a tidy-up and
 * puts a skeleton flash on every navigation.
 *
 * **One treatment, built from the `Skeleton` material and the page frame** (`docs/DESIGN_SYSTEM.md`
 * forbids a one-off loading shape). It is a div and not a `<main>`: inside the authenticated shell
 * it renders in the workspace's own `<main>`, and a second landmark there is the defect
 * `PageContainer` documents. While the shell itself is still loading it is the only content on the
 * page, which is the one moment a landmark would help and the one place the cost of its absence is
 * a second or two.
 *
 * `aria-busy` plus a status line carry the announcement, because the skeleton blocks are
 * `aria-hidden` (a skeleton is not information).
 *
 * **The status element mounts EMPTY and is filled after mount.** A live region that arrives already
 * containing its text is inserted, not changed, and assistive technology commonly announces nothing
 * for it. The shared `useAnnounce` region is no help here: this screen is shown while the shell that
 * hosts that region is itself still loading.
 */
export function RoutePending(): React.JSX.Element {
  const status = useRef<HTMLSpanElement>(null);
  // Written to the DOM rather than through state: the element has no React children to reconcile,
  // and the text must land after the empty element is already in the document.
  useEffect(() => {
    if (status.current) status.current.textContent = 'Loading…';
  }, []);
  return (
    <PageContainer aria-busy="true" data-testid="route-pending">
      <span ref={status} role="status" className="sr-only" />
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-48 w-full" />
      </div>
    </PageContainer>
  );
}
