import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { QueryPanel } from './query-panel';

interface Row {
  n: number;
}

function panel(
  query: { isPending: boolean; isError: boolean; data: Row | undefined },
  refetch = vi.fn(),
): React.ReactElement {
  return (
    <QueryPanel
      title="Counts"
      id="counts-section"
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

  it('renders the body and announces the settled sentence when answered', () => {
    render(panel({ isPending: false, isError: false, data: { n: 7 } }));
    expect(screen.getByText('value 7')).toBeInTheDocument();
    expect(screen.queryByText('skeleton slot')).not.toBeInTheDocument();
    expect(polite()).toHaveTextContent('7 counted.');
  });

  it('shows the failure shape with a retry, and announces the failure', () => {
    const refetch = vi.fn();
    render(panel({ isPending: false, isError: true, data: undefined }, refetch));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not read counts.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(polite()).toHaveTextContent('Counts could not be read.');
  });

  it('shows ONLY the error when a failed refetch left earlier data behind', () => {
    // A failed refetch does not clear `query.data`; rendering both puts "could not read" on top of
    // figures that look current.
    render(panel({ isPending: false, isError: true, data: { n: 3 } }));
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
});
