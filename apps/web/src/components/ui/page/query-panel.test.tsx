import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { QueryPanel } from './query-panel';

interface Row {
  n: number;
}

function panel(
  query: {
    isPending: boolean;
    isError: boolean;
    data: Row | undefined;
    isFetching?: boolean;
  },
  refetch = vi.fn(),
  // `null`, not `undefined`: a default parameter would swallow an explicit `undefined`.
  id: string | null = 'counts-section',
): React.ReactElement {
  return (
    <QueryPanel
      title="Counts"
      {...(id === null ? {} : { id })}
      query={{ ...query, refetch }}
      skeleton={<p>skeleton slot</p>}
      errorLabel="Could not read counts."
      errorStatus="Counts could not be read."
      settledStatus={(row) => `${String(row.n)} counted.`}
    >
      {(row) => <p>value {row.n}</p>}
    </QueryPanel>
  );
}

const polite = (): Element | null => document.querySelector('[aria-live="polite"]');

describe('QueryPanel', () => {
  it('shows the caller’s skeleton while pending, and says nothing yet', () => {
    render(panel({ isPending: true, isError: false, data: undefined }));
    expect(screen.getByText('skeleton slot')).toBeInTheDocument();
    expect(screen.queryByText(/value/)).not.toBeInTheDocument();
    expect(polite()).toHaveTextContent('');
  });

  // ADR-0178 D-6: the first settled sentence is a resting state. It is reachable as plain text and
  // is NOT spoken; only a later, different one is.
  it('renders the body and keeps the first settled sentence out of the live region', () => {
    const { rerender } = render(panel({ isPending: true, isError: false, data: undefined }));
    rerender(panel({ isPending: false, isError: false, data: { n: 7 } }));
    expect(screen.getByText('value 7')).toBeInTheDocument();
    expect(screen.queryByText('skeleton slot')).not.toBeInTheDocument();
    expect(polite()).toHaveTextContent('');
    expect(screen.getByText('7 counted.')).toBeInTheDocument();
  });

  it('announces a later change to the settled sentence', () => {
    const { rerender } = render(panel({ isPending: false, isError: false, data: { n: 7 } }));
    rerender(panel({ isPending: false, isError: false, data: { n: 8 } }));
    expect(polite()).toHaveTextContent('8 counted.');
  });

  it('shows the failure shape with a retry, and announces the failure', () => {
    const refetch = vi.fn();
    const { rerender } = render(
      panel({ isPending: false, isError: false, data: { n: 1 } }, refetch),
    );
    rerender(panel({ isPending: false, isError: true, data: undefined }, refetch));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not read counts.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(polite()).toHaveTextContent('Counts could not be read.');
  });

  it('shows ONLY the error when a failed refetch left earlier data behind', () => {
    // A failed refetch does not clear `query.data`; rendering both puts "could not read" on top of
    // figures that look current.
    const { rerender } = render(panel({ isPending: false, isError: false, data: { n: 3 } }));
    rerender(panel({ isPending: false, isError: true, data: { n: 3 } }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/value/)).not.toBeInTheDocument();
    expect(polite()).toHaveTextContent('Counts could not be read.');
  });

  it('renders nothing in the body when the query is neither pending nor answered', () => {
    render(panel({ isPending: false, isError: false, data: undefined }));
    expect(screen.queryByText(/value/)).not.toBeInTheDocument();
    expect(screen.queryByText('skeleton slot')).not.toBeInTheDocument();
    expect(polite()).toHaveTextContent('');
  });

  it('is a named section carrying the anchor id', () => {
    render(panel({ isPending: true, isError: false, data: undefined }));
    expect(screen.getByRole('region', { name: 'Counts' })).toHaveAttribute('id', 'counts-section');
  });

  it('omits the id when none is given, rather than rendering an empty one', () => {
    render(panel({ isPending: true, isError: false, data: undefined }, vi.fn(), null));
    const section = screen.getByRole('region', { name: 'Counts' });
    expect(section).not.toHaveAttribute('id');
    expect(section).not.toHaveAttribute('tabindex');
  });

  it('keeps earlier data visible and marks the section busy while a refetch is in flight', () => {
    render(panel({ isPending: false, isError: false, data: { n: 4 }, isFetching: true }));
    expect(screen.getByText('value 4')).toBeInTheDocument();
    expect(screen.queryByText('skeleton slot')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Counts' })).toHaveAttribute('aria-busy', 'true');
  });

  it('is not busy when idle, and does not say busy when no isFetching is passed', () => {
    const { rerender } = render(panel({ isPending: false, isError: false, data: { n: 4 } }));
    expect(screen.getByRole('region', { name: 'Counts' })).not.toHaveAttribute('aria-busy');
    rerender(panel({ isPending: false, isError: false, data: { n: 4 }, isFetching: false }));
    expect(screen.getByRole('region', { name: 'Counts' })).not.toHaveAttribute('aria-busy');
  });

  it('withholds placeholder data the moment the read fails, while still saying a retry is in flight', () => {
    // A refetch that fails while earlier (placeholder) data is still held: the error wins.
    render(panel({ isPending: false, isError: true, data: { n: 4 }, isFetching: true }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/value/)).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Counts' })).toHaveAttribute('aria-busy', 'true');
  });
});
