import { render, screen } from '@testing-library/react';
import { useMemo } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { UnsavedWorkReport } from '@/lib/unsaved-work/report';

const blockCalls = { count: 0 };
let lastOpts: { shouldBlockFn: (a: unknown) => boolean; enableBeforeUnload?: unknown } | null =
  null;

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
    return { status: 'idle' as const, proceed: undefined, reset: undefined };
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
});
