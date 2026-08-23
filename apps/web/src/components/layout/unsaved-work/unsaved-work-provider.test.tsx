import { render, screen } from '@testing-library/react';
import { useEffect, useMemo } from 'react';
import { describe, expect, it } from 'vitest';

import {
  UnsavedWorkProvider,
  useRegisterUnsavedWork,
  useUnsavedWorkRegistry,
  useUnsavedWorkReports,
} from './unsaved-work-provider';

import type { UnsavedWorkReport } from '@/lib/unsaved-work/report';

function Registrant({ subject, dirty }: { subject: string; dirty: boolean }): null {
  const report = useMemo<UnsavedWorkReport | null>(
    () => (dirty ? { subject, scopes: [{ key: 'k', label: subject, savable: true }] } : null),
    [subject, dirty],
  );
  useRegisterUnsavedWork(report);
  return null;
}

/** Renders the live registry so assertions read what the blocker would read. */
function Readout(): React.ReactElement {
  const reports = useUnsavedWorkReports();
  return (
    <output data-testid="out">
      {reports
        .map((r) => r.subject)
        .sort()
        .join('|')}
    </output>
  );
}

const out = () => screen.getByTestId('out').textContent;

describe('unsaved-work registry', () => {
  /**
   * The registrant-side counterpart to `navigation-guard.test.tsx`'s registration count, and it
   * exists because the component review found the asymmetry: the BLOCKER side was pinned at one
   * registration across five renders while the REGISTRANT side had no equivalent, and three of the
   * four shipped call sites were passing a fresh object literal on every render. Each of those woke
   * every subscriber on every keystroke.
   */
  it('does not notify subscribers when a re-render reports the same thing', () => {
    let notifications = 0;
    // Subscribes to the registry DIRECTLY rather than counting renders: a consumer component
    // re-renders whenever its parent does, so a render count cannot tell a notification from
    // ordinary tree work. The first version of this test made exactly that mistake and reported
    // 6-vs-1 against a working guard.
    function Probe(): null {
      const registry = useUnsavedWorkRegistry();
      useEffect(
        () =>
          registry?.subscribe(() => {
            notifications += 1;
          }),
        [registry],
      );
      return null;
    }
    function Churner({ tick }: { tick: number }): React.ReactElement {
      // A NEW object literal every render — what the un-memoised call sites do.
      useRegisterUnsavedWork({
        subject: 'This activity',
        scopes: [{ key: 'general', label: 'General', savable: true }],
      });
      return <output data-testid="tick">{tick}</output>;
    }
    const tree = (tick: number) => (
      <UnsavedWorkProvider>
        <Probe />
        <Churner tick={tick} />
      </UnsavedWorkProvider>
    );
    const { rerender } = render(tree(0));
    const afterFirst = notifications;
    expect(afterFirst).toBe(1);

    for (const tick of [1, 2, 3, 4, 5]) rerender(tree(tick));

    // Verified red against the registry without the equality guard, where each re-render bumped.
    expect(notifications).toBe(afterFirst);
  });

  it('unmounting one registrant leaves the other still registered', () => {
    const { rerender } = render(
      <UnsavedWorkProvider>
        <Registrant subject="Editor" dirty />
        <Registrant subject="Calendar" dirty />
        <Readout />
      </UnsavedWorkProvider>,
    );
    expect(out()).toBe('Calendar|Editor');

    rerender(
      <UnsavedWorkProvider>
        <Registrant subject="Editor" dirty />
        <Readout />
      </UnsavedWorkProvider>,
    );
    expect(out()).toBe('Editor');
  });

  /**
   * Two mounts of the SAME component. With a caller-supplied key they share one entry, so the
   * first unmount deletes the survivor's registration. Minting the token inside the hook is what
   * makes this hold.
   */
  it('two mounts of the same component do not share an entry', () => {
    const { rerender } = render(
      <UnsavedWorkProvider>
        <Registrant subject="Editor" dirty />
        <Registrant subject="Editor" dirty />
        <Readout />
      </UnsavedWorkProvider>,
    );
    expect(out()).toBe('Editor|Editor');

    rerender(
      <UnsavedWorkProvider>
        <Registrant subject="Editor" dirty />
        <Readout />
      </UnsavedWorkProvider>,
    );
    expect(out()).toBe('Editor');
  });

  it('registers, updates and deregisters as dirtiness changes', () => {
    const { rerender } = render(
      <UnsavedWorkProvider>
        <Registrant subject="Editor" dirty={false} />
        <Readout />
      </UnsavedWorkProvider>,
    );
    expect(out()).toBe('');

    rerender(
      <UnsavedWorkProvider>
        <Registrant subject="Editor" dirty />
        <Readout />
      </UnsavedWorkProvider>,
    );
    expect(out()).toBe('Editor');

    rerender(
      <UnsavedWorkProvider>
        <Registrant subject="Editor" dirty={false} />
        <Readout />
      </UnsavedWorkProvider>,
    );
    expect(out()).toBe('');
  });

  it('a surface outside the provider registers without throwing', () => {
    // Lets a dialog call the hook unconditionally rather than branching on where it is mounted.
    expect(() => render(<Registrant subject="Orphan" dirty />)).not.toThrow();
  });

  it('reports nothing when every registrant is clean', () => {
    render(
      <UnsavedWorkProvider>
        <Registrant subject="Editor" dirty={false} />
        <Registrant subject="Calendar" dirty={false} />
        <Readout />
      </UnsavedWorkProvider>,
    );
    expect(out()).toBe('');
  });
});
