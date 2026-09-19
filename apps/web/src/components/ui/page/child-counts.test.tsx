import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ChildCounts } from './child-counts';

/**
 * Omitted, never zeroed — and a zero that is real is still rendered.
 *
 * The distinction is the whole point of the component: the API omits a count it could not take
 * rather than reporting `0` (ADR-0126 — a zero is a claim that there are none), so `undefined` and
 * `0` mean opposite things and a careless `?? 0` collapses them into the reassuring one.
 */
describe('ChildCounts', () => {
  it('renders a real zero', () => {
    render(<ChildCounts counts={[{ value: 0, one: 'project', many: 'projects' }]} />);
    expect(screen.getByText('0 projects')).toBeInTheDocument();
  });

  it('drops a count the API omitted, keeping its siblings', () => {
    render(
      <ChildCounts
        counts={[
          { value: undefined, one: 'project', many: 'projects' },
          { value: 3, one: 'plan', many: 'plans' },
        ]}
      />,
    );
    expect(screen.getByText('3 plans')).toBeInTheDocument();
    expect(screen.queryByText(/project/)).not.toBeInTheDocument();
    // And no orphaned separator: "· 3 plans" reads as a list with something missing from it.
    expect(screen.getByText('3 plans').textContent).not.toContain('·');
  });

  it('renders nothing at all when every count is absent', () => {
    // Not an empty separator, and not a container with nothing in it — the header's `aside` slot
    // adds a gap around whatever it is given.
    const { container } = render(
      <ChildCounts counts={[{ value: undefined, one: 'project', many: 'projects' }]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for an empty list', () => {
    // Distinct from the case above, which reaches the same branch through a populated list that
    // filters to nothing. A caller with no counts at all is the likelier shape once a third screen
    // adopts this.
    const { container } = render(<ChildCounts counts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('uses the singular phrase for exactly one', () => {
    render(<ChildCounts counts={[{ value: 1, one: 'project', many: 'projects' }]} />);
    expect(screen.getByText('1 project')).toBeInTheDocument();
  });

  it('joins several with a separator', () => {
    render(
      <ChildCounts
        counts={[
          { value: 4, one: 'plan', many: 'plans' },
          { value: 12, one: 'activity across its plans', many: 'activities across its plans' },
        ]}
      />,
    );
    expect(screen.getByText('4 plans · 12 activities across its plans')).toBeInTheDocument();
  });
});
