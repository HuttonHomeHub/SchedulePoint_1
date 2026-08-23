import { render, screen } from '@testing-library/react';
import { useMemo } from 'react';
import { describe, expect, it } from 'vitest';

import {
  UnsavedWorkProvider,
  useRegisterUnsavedWork,
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
   * **Written first and verified red**, per the plan's M1-T2. A cleanup that clears the whole map,
   * or one keyed on a caller-supplied string, passes every other case in this file and fails only
   * this one — and the failure it represents is a guard that silently stops guarding.
   */
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
