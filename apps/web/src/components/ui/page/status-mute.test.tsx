import { act, render, renderHook, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it } from 'vitest';

import { QueryPanel } from './query-panel';
import { StatusMuteProvider, useStatusMuted } from './status-mute';
import { StatusSection } from './status-section';

describe('StatusMuteProvider', () => {
  it('reads false with no provider, so every other caller is unchanged', () => {
    const { result } = renderHook(() => useStatusMuted());
    expect(result.current).toBe(false);
  });

  it('supplies what it is given', () => {
    const { result, rerender } = renderHook(() => useStatusMuted(), {
      wrapper: ({ children }) => <StatusMuteProvider muted>{children}</StatusMuteProvider>,
    });
    expect(result.current).toBe(true);
    rerender();
    expect(result.current).toBe(true);
  });
});

const polite = (): Element | null => document.querySelector('[aria-live="polite"]');
const nextTask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function panel(n: number, muted: boolean, strict = false): React.ReactElement {
  const tree = (
    <StatusMuteProvider muted={muted}>
      <QueryPanel
        title="Counts"
        query={{
          isPending: false,
          isError: false,
          data: { n },
          refetch: () => undefined,
        }}
        skeleton={<p>skeleton</p>}
        errorLabel="Could not read counts."
        errorStatus="Counts could not be read."
        settledStatus={(row: { n: number }) => `${String(row.n)} counted.`}
      >
        {(row) => <p>value {row.n}</p>}
      </QueryPanel>
    </StatusMuteProvider>
  );
  return strict ? <StrictMode>{tree}</StrictMode> : tree;
}

describe('a StatusSection under a muted provider (ADR-0178 D8)', () => {
  it('writes a changed sentence as plain text and keeps its region silent', () => {
    const { rerender } = render(panel(7, false));
    rerender(panel(8, true));
    expect(polite()).toHaveTextContent('');
    expect(screen.getByText('8 counted.')).toBeInTheDocument();
  });

  it('says nothing when the mute lifts, for a change it witnessed inside the window', () => {
    const { rerender } = render(panel(7, false));
    rerender(panel(8, true));
    rerender(panel(8, false));
    expect(polite()).toHaveTextContent('');
    expect(screen.getByText('8 counted.')).toBeInTheDocument();
  });

  it('treats several changes inside the window as one baseline, silently', () => {
    const { rerender } = render(panel(7, false));
    rerender(panel(8, true));
    rerender(panel(9, true));
    rerender(panel(9, false));
    expect(polite()).toHaveTextContent('');
  });

  // The defect the effect-timed unmute exists to prevent: a late notification, one task after the
  // window closed, must be heard — it is news, not something the window swallowed.
  it('speaks a change that arrives one task after the mute lifts', async () => {
    const { rerender } = render(panel(7, false));
    rerender(panel(8, true));
    rerender(panel(8, false));
    await act(nextTask);
    rerender(panel(9, false));
    expect(polite()).toHaveTextContent('9 counted.');
  });

  it('is unaffected by a strict-mode double render', async () => {
    const { rerender } = render(panel(7, false, true));
    rerender(panel(8, true, true));
    rerender(panel(8, false, true));
    expect(polite()).toHaveTextContent('');
    await act(nextTask);
    rerender(panel(9, false, true));
    expect(polite()).toHaveTextContent('9 counted.');
  });

  it('baselines a first sentence that arrives during the window', () => {
    const { rerender } = render(
      <StatusMuteProvider muted>
        <QueryPanel
          title="Counts"
          query={{ isPending: true, isError: false, data: undefined, refetch: () => undefined }}
          skeleton={<p>skeleton</p>}
          errorLabel="e"
          errorStatus="e."
          settledStatus={(row: { n: number }) => `${String(row.n)} counted.`}
        >
          {(row) => <p>value {row.n}</p>}
        </QueryPanel>
      </StatusMuteProvider>,
    );
    rerender(panel(5, true));
    rerender(panel(5, false));
    expect(polite()).toHaveTextContent('');
    expect(screen.getByText('5 counted.')).toBeInTheDocument();
  });

  // The mute is for `change` boxes only: a `settle` box speaks its arrival, which no Refresh makes.
  it('leaves a settle section speaking as it always did', () => {
    render(
      <StatusMuteProvider muted>
        <StatusSection title="Counts" status="5 counted.">
          <p>body</p>
        </StatusSection>
      </StatusMuteProvider>,
    );
    expect(polite()).toHaveTextContent('5 counted.');
  });
});
