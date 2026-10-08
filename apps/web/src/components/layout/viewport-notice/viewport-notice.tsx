import { useNavigate, useParams } from '@tanstack/react-router';
import { createContext, use, useId, useLayoutEffect, useRef, useState } from 'react';

import { DevicesPictogram } from './devices-pictogram';
import { BANNER_TEXT, useViewportNotice, type ViewportNoticeState } from './use-viewport-notice';

import { BrandCard } from '@/components/layout/brand-card';
import { Button } from '@/components/ui/button';
import { useNativeDialogClose } from '@/components/ui/native-dialog-close';
import { NoticeStrip } from '@/components/ui/notice-strip';
import { useMediaQuery } from '@/components/ui/use-media-query';
import { useNativeModal } from '@/components/ui/use-native-modal';
import { useSession, useSignOut } from '@/features/auth';
import { useOrganizations } from '@/features/organizations';
import { designedMinWidthPx } from '@/lib/breakpoints';

const NoticeContext = createContext<ViewportNoticeState | null>(null);

/**
 * **"SchedulePoint is designed for larger screens"** (ADR-0179, `docs/specs/minimum-viewport`).
 *
 * Wraps the signed-in shell and renders the full-screen page **beside** it. The page is a native
 * `<dialog>` opened with `showModal()` and closed with `close()` — **never unmounted** — so
 * the shell underneath is only made inert, never torn down: an open editor, a typed value and its
 * dirty state survive (ADR-0169). It is deliberately not the `Dialog` primitive (that brings an
 * `h2`, an X button and card widths this page does not want) and deliberately not registered with
 * `UnsavedWorkProvider`: it holds no work, and it must never be the thing that blocks a navigation.
 *
 * Its home is the signed-in layout, so it can never reach `/sign-in`, `/share` or `/staff`, which
 * are children of the root route. `viewport-notice.test.tsx` pins that.
 *
 * `useViewportNotice` decides when it speaks; the banner is rendered by {@link ViewportBanner}
 * **inside the shell's grid**, which reads the same state from here.
 */
export function ViewportNotice({ children }: { children: React.ReactNode }): React.ReactElement {
  const state = useViewportNotice();
  return (
    <NoticeContext value={state}>
      {children}
      <LargerScreensPage />
    </NoticeContext>
  );
}

function useNotice(): ViewportNoticeState {
  const state = use(NoticeContext);
  if (!state) throw new Error('ViewportBanner must be rendered inside <ViewportNotice>.');
  return state;
}

/**
 * The slim, non-modal strip a live narrowing gets instead of the page. Rendered by the shell into
 * its banner seat (`app-shell.tsx`), after the skip link.
 *
 * - **It never takes focus.** Taking it would pull a reader out of a field in the middle of the
 *   very narrowing that caused it.
 * - **The live region is mounted, empty, at all times** and only its text changes. A region that
 *   arrives with its text already inside is announced by some screen readers and not others; one
 *   that is present first and then written to is announced by all of them, politely.
 * - The strip is `NoticeStrip`'s existing `info` tone and `Button`'s existing variants; it wraps its
 *   two buttons under the sentence rather than squeezing it, so at 320 px both stay reachable.
 */
export function ViewportBanner(): React.ReactElement {
  const { bannerVisible, continueAnyway, dismissForVisit } = useNotice();
  const rememberId = useId();
  return (
    <div className="print:hidden">
      <div role="status" aria-live="polite" className="sr-only">
        {bannerVisible ? BANNER_TEXT : ''}
      </div>
      {bannerVisible ? (
        <NoticeStrip
          tone="info"
          density="comfortable"
          messageFit="grow"
          message={BANNER_TEXT}
          className="flex-wrap items-center rounded-none border-x-0 border-t-0 py-1"
          data-testid="viewport-banner"
        >
          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              variant="outline"
              aria-describedby={rememberId}
              onClick={continueAnyway}
            >
              Continue anyway
            </Button>
            {/* The page says this under its button; the strip has no room for the sentence, so a
                screen-reader user gets it as the button's description instead. */}
            <span id={rememberId} className="sr-only">
              We won&apos;t show this again on this device.
            </span>
            <Button size="sm" variant="ghost" onClick={dismissForVisit}>
              Dismiss
            </Button>
          </div>
        </NoticeStrip>
      ) : null}
    </div>
  );
}

function LargerScreensPage(): React.ReactElement {
  const { pageOpen, continueAnyway, dismissForVisit } = useNotice();
  const ref = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<Element | null>(null);
  const headingId = useId();
  const leadId = useId();

  // Recorded BEFORE `useNativeModal` runs (effects run in declaration order): `showModal()` moves
  // focus, and the element that held it is what the browser restores on close.
  useLayoutEffect(() => {
    if (pageOpen) returnFocusRef.current = document.activeElement;
  }, [pageOpen]);

  useNativeModal({ ref, open: pageOpen, layout: true });

  // `showModal()` focuses the dialog's first focusable descendant; the reader should land on the
  // heading, so the first thing read is the sentence that explains the page.
  useLayoutEffect(() => {
    if (pageOpen) headingRef.current?.focus();
  }, [pageOpen]);

  /**
   * **`close` is the source of truth** (`native-dialog-close.ts`): Chrome can close a modal opened
   * without a user gesture without ever firing `cancel`, so keying on Escape would miss it. A close
   * we did not ask for — Escape, or the browser's own — is a visit-only dismissal. One we did ask
   * for (widening, Continue) has already flipped `pageOpen` to false by the time this task runs, so
   * it records nothing: widening stores nothing (D-b).
   *
   * Then focus: the browser restores it to the element that held it when that element is still
   * focusable. When it is not — gone, or connected but inside the closed Explorer `Sheet`, which
   * stays mounted — focus has gone to `<body>`, and `#main` is the nearest honest place (the shell
   * has no heading of its own). On a fresh load the recorded element IS `<body>`, which is also
   * "nowhere", so that goes to `#main` too: pressing the button must not leave a keyboard reader
   * with no focus ring at all.
   */
  const closeHandlers = useNativeDialogClose({
    ref,
    onClose: () => {
      if (pageOpen) dismissForVisit();
      const target = returnFocusRef.current;
      returnFocusRef.current = null;
      const restored =
        target !== null && target !== document.body && document.activeElement === target;
      if (!restored) document.getElementById('main')?.focus();
    },
  });

  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      aria-describedby={leadId}
      onClose={closeHandlers.onClose}
      // `fixed inset-0` with the UA's `margin: auto` removed: the dialog is the whole viewport and
      // the scroller, so a short window scrolls the page and never clips it. Closed, the UA's
      // `display: none` applies, which is why no `display` utility appears here.
      className="fixed inset-0 m-0 h-dvh max-h-none w-dvw max-w-none overflow-y-auto border-0 bg-transparent p-0 backdrop:bg-transparent print:hidden"
    >
      {pageOpen ? (
        <PageContent
          headingId={headingId}
          leadId={leadId}
          headingRef={headingRef}
          onContinue={continueAnyway}
          onNotNow={dismissForVisit}
        />
      ) : null}
    </dialog>
  );
}

function useWindowWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useLayoutEffect(() => {
    const onResize = (): void => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

function PageContent({
  headingId,
  leadId,
  headingRef,
  onContinue,
  onNotNow,
}: {
  headingId: string;
  leadId: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onContinue: () => void;
  onNotNow: () => void;
}): React.ReactElement {
  const width = useWindowWidth();
  const coarse = useMediaQuery('(pointer: coarse)', false);
  // Read where the width is read, so the stated floor and "Your window is N pixels wide" are in the
  // same units even when the browser's font size is raised (the floor is 64rem, not 1024px).
  const floor = designedMinWidthPx();

  const tips = [
    'Zoom out — press Ctrl and minus, or Ctrl and 0 to reset (⌘ on a Mac)',
    'Make the browser window wider',
  ];
  if (coarse) tips.unshift('Turn your device sideways');

  return (
    <BrandCard
      as="div"
      fit="content"
      // An opaque system-colour card under forced colours: the brand surface's navy and wash are
      // backgrounds, which that mode replaces, and a card with no edge of its own would dissolve
      // into the ground.
      className="forced-colors:border forced-colors:border-[CanvasText] forced-colors:bg-[Canvas]"
      columnClassName="gap-3 p-4 md:p-6"
    >
      <DevicesPictogram className="text-primary tall:block hidden h-14 w-auto self-start" />
      <h1
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="text-xl font-semibold tracking-tight focus-visible:outline-none md:text-2xl"
      >
        SchedulePoint is designed for larger screens
      </h1>
      <p id={leadId} className="text-muted-foreground text-sm">
        It&apos;s designed for screens at least {floor} pixels wide. Your window is {width} pixels
        wide.
      </p>
      {/* A list with no focusable controls, on purpose: it keeps "Continue anyway" the first tab
          stop, which is the one thing a keyboard reader came here to find. */}
      <ul className="text-foreground list-disc space-y-1 pl-5 text-sm">
        {tips.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
      <p className="text-muted-foreground text-sm">
        Zoomed in on purpose? You can continue — the diagram and Gantt will need scrolling.
      </p>
      {/* Pinned to the dialog's bottom edge so the button stays on screen in a short window while
          the explanation above it scrolls. Opaque, so text never shows through it. */}
      <div className="bg-background sticky bottom-0 flex flex-col items-start gap-1 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={onContinue}>
            Continue anyway
          </Button>
          {/* Touch has no Escape. It does what Escape does — dismisses for this visit and writes
              nothing — and sits after Continue so that stays the first tab stop. */}
          <Button variant="ghost" onClick={onNotNow}>
            Not now
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          We won&apos;t show this again on this device.
        </p>
      </div>
      <SignedInLine />
    </BrandCard>
  );
}

/**
 * Who is signed in, and a way out. It is what tells this page apart from the signed-out screens it
 * resembles: without it a reader sees navy, a card and a logo, and reasonably concludes they were
 * signed out.
 */
function SignedInLine(): React.ReactElement | null {
  const { data: session } = useSession();
  const { data: organisations } = useOrganizations();
  const params = useParams({ strict: false });
  const signOut = useSignOut();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  const orgSlug = 'orgSlug' in params ? params.orgSlug : undefined;
  const organisation = organisations?.find((org) => org.slug === orgSlug)?.name;
  const who = session?.user.name?.trim() || session?.user.email;
  if (!who) return null;

  return (
    <div className="border-border flex flex-wrap items-center justify-between gap-x-3 border-t pt-2 text-sm">
      <p className="text-muted-foreground min-w-0">
        Signed in as {who}
        {organisation ? ` · ${organisation}` : ''}
        {/* Mounted empty and written to, so the failure is announced politely. */}
        <span role="status" aria-live="polite">
          {failed ? ' Couldn\u2019t sign out. Try again.' : ''}
        </span>
      </p>
      <Button
        size="sm"
        variant="ghost"
        // `aria-disabled`, not `disabled`: a native disabled control blurs to `<body>`, which inside
        // a modal dialog leaves a keyboard reader nowhere (the AcceptInvitationCard pattern).
        aria-disabled={signOut.isPending}
        onClick={() => {
          if (signOut.isPending) return;
          setFailed(false);
          signOut.mutate(undefined, {
            onError: () => setFailed(true),
            onSuccess: () => {
              // As the account menu does: `signedOut` carries the confirmation across, so signing
              // out from here does not look like an expired session.
              void navigate({ to: '/sign-in', search: { signedOut: 'true' } });
            },
          });
        }}
      >
        {signOut.isPending ? 'Signing out…' : 'Sign out'}
      </Button>
    </div>
  );
}
