import { render, screen, waitFor } from '@testing-library/react';
import { useMemo } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AnnouncerProvider } from '@/components/ui/announcer';
import type { UnsavedWorkReport } from '@/lib/unsaved-work/report';

const blockCalls = { count: 0 };
let lastOpts: { shouldBlockFn: (a: unknown) => boolean; enableBeforeUnload?: unknown } | null =
  null;

/**
 * What the mocked `useBlocker` reports back. Idle for every case that only inspects the callbacks;
 * `blocked` for the two that need the component to actually render its decision.
 */
const blocker: {
  status: 'idle' | 'blocked';
  proceed: ReturnType<typeof vi.fn> | undefined;
  reset: ReturnType<typeof vi.fn> | undefined;
} = { status: 'idle', proceed: undefined, reset: undefined };

/**
 * A stand-in for `useBlocker` that records how often it REGISTERS.
 *
 * The real hook lists `shouldBlockFn` and `enableBeforeUnload` in its registering effect's
 * dependency array, so an inline arrow for either re-registers the blocker on every render — i.e.
 * on every keystroke in a form. That is invisible in behaviour and expensive, and the only way to
 * pin it is to count.
 */
vi.mock('@tanstack/react-router', () => ({
  useBlocker: (opts: { shouldBlockFn: (a: unknown) => boolean; enableBeforeUnload?: unknown }) => {
    // Registration happens when either callback's identity changes — mirroring the real dep array.
    if (
      lastOpts?.shouldBlockFn !== opts.shouldBlockFn ||
      lastOpts?.enableBeforeUnload !== opts.enableBeforeUnload
    ) {
      blockCalls.count += 1;
      lastOpts = opts;
    }
    return blocker;
  },
}));

const { NavigationGuard } = await import('./navigation-guard');
const { UnsavedWorkProvider, useRegisterUnsavedWork } = await import('./unsaved-work-provider');

function Typist({ value }: { value: string }): React.ReactElement {
  const report = useMemo<UnsavedWorkReport | null>(
    () =>
      value
        ? {
            subject: 'This activity',
            scopes: [{ key: 'general', label: 'General', savable: true }],
          }
        : null,
    [value],
  );
  useRegisterUnsavedWork(report);
  return <output data-testid="typed">{value}</output>;
}

afterEach(() => {
  blockCalls.count = 0;
  lastOpts = null;
  blocker.status = 'idle';
  blocker.proceed = undefined;
  blocker.reset = undefined;
});

describe('the navigation guard registers once, not once per render', () => {
  it('does not re-register while a form is being typed into', () => {
    const { rerender } = render(
      <UnsavedWorkProvider>
        <NavigationGuard />
        <Typist value="" />
      </UnsavedWorkProvider>,
    );
    const afterMount = blockCalls.count;
    expect(afterMount).toBe(1);

    for (const value of ['E', 'Ex', 'Exc', 'Exca', 'Excav']) {
      rerender(
        <UnsavedWorkProvider>
          <NavigationGuard />
          <Typist value={value} />
        </UnsavedWorkProvider>,
      );
    }
    expect(screen.getByTestId('typed').textContent).toBe('Excav');

    // Five renders with the registry changing on each. The count must not move: both callbacks read
    // a ref and are `useCallback([])`. Verified red against an inline-arrow version, which reaches 6.
    expect(blockCalls.count).toBe(afterMount);
  });

  it('the beforeunload gate is a FUNCTION, never a boolean', () => {
    render(
      <UnsavedWorkProvider>
        <NavigationGuard />
      </UnsavedWorkProvider>,
    );
    // `@tanstack/history` treats `enableBeforeUnload === true` as "block" WITHOUT consulting
    // shouldBlockFn, so a boolean here prompts on every reload of every page, clean or not. This
    // asserts the shape rather than the behaviour, because the behaviour needs a real browser.
    expect(typeof lastOpts?.enableBeforeUnload).toBe('function');
  });

  /**
   * **Sign-out must never be blocked, and this asserts the BEHAVIOUR rather than the source text.**
   *
   * The security review found the allow-list pinned only by `navigation-guard.allow-list.test.ts`,
   * which greps the file — so reordering the two `if`s inside `shouldBlockFn`, or changing the
   * comparison, would keep that test green while trapping a planner with unsaved work on a machine
   * they are trying to leave. The consequence is an unattended, still-authenticated session, which
   * is why it earns a real invocation.
   */
  it('never blocks a navigation to sign-in, even with unsaved work', () => {
    render(
      <UnsavedWorkProvider>
        <NavigationGuard />
        <Typist value="dirty" />
      </UnsavedWorkProvider>,
    );
    const shouldBlock = lastOpts?.shouldBlockFn as (a: unknown) => boolean;

    // Dirty, going somewhere else: blocked.
    expect(
      shouldBlock({
        next: { fullPath: '/orgs/$orgSlug' },
        current: { fullPath: '/plans/$planId' },
      }),
    ).toBe(true);

    // Dirty, going to sign-in: never blocked.
    expect(
      shouldBlock({ next: { fullPath: '/sign-in' }, current: { fullPath: '/plans/$planId' } }),
    ).toBe(false);
  });

  it('does not block a navigation to where the reader already is', () => {
    render(
      <UnsavedWorkProvider>
        <NavigationGuard />
        <Typist value="dirty" />
      </UnsavedWorkProvider>,
    );
    const shouldBlock = lastOpts?.shouldBlockFn as (a: unknown) => boolean;
    expect(
      shouldBlock({
        next: { fullPath: '/plans/$planId' },
        current: { fullPath: '/plans/$planId' },
      }),
    ).toBe(false);
  });

  it('the beforeunload gate answers false when nothing is dirty', () => {
    render(
      <UnsavedWorkProvider>
        <NavigationGuard />
        <Typist value="" />
      </UnsavedWorkProvider>,
    );
    expect((lastOpts?.enableBeforeUnload as () => boolean)()).toBe(false);
  });

  /**
   * **The silent auto-proceed** (`docs/TECH_DEBT.md` #184).
   *
   * When the work goes away while the confirmation is open — a save lands, or the surface unmounts
   * — the guard lets the navigation through. That is right: asking about work that no longer exists
   * is a question with no true answer. What was missing is that it happened in **silence**: the
   * dialog the reader was reading vanished and the page changed with no gesture of theirs, which is
   * an unexpected context change (WCAG 3.2.x territory) and, for a screen-reader user, one
   * potentially mid-sentence.
   *
   * The visual channel needs nothing — the page moved, which is its own explanation. The audible
   * one had nothing at all, and this is the only path in the guard with no control to attach a
   * message to.
   *
   * **Writing this found the item understated the defect: the auto-proceed was not silent, it was
   * unreliable.** The guard read the registry imperatively and nothing subscribed it to changes, so
   * the effect's dependencies could not move while a confirmation stood — it could fire only if
   * something unrelated happened to re-render the component. Verified: with the pre-fix effect
   * restored, `proceed` is not called at all here. The fix is the subscription, and the
   * announcement rides on it.
   */
  it('announces the reason when work disappears and the navigation proceeds by itself', async () => {
    blocker.proceed = vi.fn();
    const tree = (value: string): React.ReactElement => (
      <AnnouncerProvider>
        <UnsavedWorkProvider>
          <NavigationGuard />
          <Typist value={value} />
        </UnsavedWorkProvider>
      </AnnouncerProvider>
    );

    // **Idle first, and that is not ceremony.** `NavigationGuard` renders before `Typist`
    // registers, so on the very first commit the registry is empty — a state the real hook cannot
    // produce, because it only reports `blocked` after `shouldBlockFn` read the registry and found
    // work there. Starting blocked would make the guard proceed at mount and the assertion below
    // would pass for the wrong reason.
    const { rerender } = render(tree('dirty'));
    blocker.status = 'blocked';
    rerender(tree('dirty'));

    // Blocked and still dirty: the dialog stands and nothing is announced or proceeded.
    expect(blocker.proceed).not.toHaveBeenCalled();
    expect(screen.getByTestId('announcer').textContent).toBe('');

    // The save lands — the surface deregisters while the dialog is open.
    rerender(tree(''));

    expect(blocker.proceed).toHaveBeenCalled();
    // The announcer clears then sets on the next frame; assert on the region once it settles.
    await waitFor(() => expect(screen.getByTestId('announcer')).toHaveTextContent(/saved/i));
  });
});
